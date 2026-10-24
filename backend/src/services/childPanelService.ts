import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { decryptSecret, encryptSecret, normalizeDomain, publicChildPanelId } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { getChildPanelSettings } from "./settingsService.js";
import { getLoyaltyForUser } from "./loyaltyService.js";
import { getPanelForUser } from "./resellerService.js";
import type { AuthUser } from "../middleware/auth.js";

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;

const listSelect = `
  o.id, o.public_id, o.user_id, o.domain, o.panel_currency, o.admin_username,
  o.monthly_price, o.currency, o.status, o.vip_complimentary, o.admin_note,
  o.expires_at, o.provisioned_at, o.refunded_at, o.created_at, o.updated_at,
  u.full_name, u.email
`;

function assertDomain(raw: string) {
  const domain = normalizeDomain(raw);
  if (!DOMAIN_RE.test(domain)) throw new AppError("Enter a valid domain, for example example.com");
  return domain;
}

function publicOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    public_id: row.public_id,
    domain: row.domain,
    panel_currency: row.panel_currency,
    admin_username: row.admin_username,
    monthly_price: Number(row.monthly_price),
    currency: row.currency,
    status: row.status,
    vip_complimentary: Boolean(row.vip_complimentary),
    admin_note: row.admin_note,
    expires_at: row.expires_at,
    provisioned_at: row.provisioned_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getChildPanelOffer(user: AuthUser) {
  const settings = await getChildPanelSettings();
  const loyalty = await getLoyaltyForUser(user.id);
  const vipComplimentary = user.role === "customer" && loyalty.childPanelFree;
  const orders = await query(
    `SELECT ${listSelect}
     FROM child_panel_orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [user.id]
  );
  return {
    enabled: settings.enabled,
    monthlyPrice: vipComplimentary ? 0 : settings.monthlyPrice,
    listPrice: settings.monthlyPrice,
    currency: settings.currency,
    nameservers: settings.nameservers,
    currencies: settings.currencies,
    vipComplimentary,
    orders: orders.map(publicOrder),
  };
}

export async function placeChildPanelOrder(user: AuthUser, input: {
  domain: string;
  panelCurrency: string;
  adminUsername: string;
  adminPassword: string;
  confirmPassword: string;
}) {
  if (user.role === "admin") throw new AppError("Admins cannot order a child panel from this form");
  const panel = await getPanelForUser(user.id);
  if (panel) throw new AppError("Child panel orders are placed from the main site, not a reseller storefront.");

  const settings = await getChildPanelSettings();
  if (!settings.enabled) throw new AppError("Child panel orders are not available right now");

  const domain = assertDomain(input.domain);
  const adminUsername = input.adminUsername.trim();
  if (!USERNAME_RE.test(adminUsername)) {
    throw new AppError("Admin username must be 3–40 letters, numbers, dots, underscores, or hyphens");
  }
  if (input.adminPassword.length < 8 || input.adminPassword.length > 72) {
    throw new AppError("Admin password must be between 8 and 72 characters");
  }
  if (input.adminPassword !== input.confirmPassword) {
    throw new AppError("Admin password and confirm password do not match");
  }

  const currencyCode = input.panelCurrency.trim().toUpperCase();
  const allowed = settings.currencies.some((item) => item.code.toUpperCase() === currencyCode);
  if (!allowed) throw new AppError("Choose a panel currency from the list");

  const loyalty = await getLoyaltyForUser(user.id);
  const vipComplimentary = user.role === "customer" && loyalty.childPanelFree;
  const price = vipComplimentary ? 0 : Number(settings.monthlyPrice);
  if (!Number.isFinite(price) || price < 0) throw new AppError("Child panel price is not configured");

  let created: Record<string, unknown>;
  try {
    created = await withTransaction(async (client) => {
    const taken = await queryOne(
      `SELECT id FROM child_panel_orders
       WHERE lower(domain) = $1 AND status IN ('pending', 'processing', 'active')
       FOR UPDATE`,
      [domain],
      client
    );
    if (taken) throw new AppError("That domain already has a child panel order");

    const wallet = await queryOne<{ id: string; balance: string }>(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [user.id],
      client
    );
    if (!wallet) throw new AppError("Wallet not found", 400);
    const balance = Number(wallet.balance);
    if (balance < price) {
      throw new AppError("Insufficient wallet balance. Add funds, then submit this Child Panel order.");
    }

    const newBalance = Number((balance - price).toFixed(4));
    if (price > 0) {
      await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [wallet.id, newBalance], client);
    }

    const publicId = publicChildPanelId();
    const order = await queryOne<Record<string, unknown>>(
      `INSERT INTO child_panel_orders (
         public_id, user_id, domain, panel_currency, admin_username, admin_password_encrypted,
         monthly_price, currency, status, vip_complimentary, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9, NOW() + INTERVAL '1 month')
       RETURNING *`,
      [
        publicId,
        user.id,
        domain,
        currencyCode,
        adminUsername,
        encryptSecret(input.adminPassword),
        price,
        settings.currency,
        vipComplimentary,
      ],
      client
    );

    if (price > 0) {
      await query(
        `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description, metadata)
         VALUES ($1,$2,'order_payment',$3,$4,$5,$6,$7::jsonb)`,
        [
          wallet.id,
          user.id,
          -price,
          newBalance,
          publicId,
          `Child panel ${domain}`,
          JSON.stringify({ childPanelOrderId: order!.id, domain }),
        ],
        client
      );
    }
    if (vipComplimentary) {
      await query(
        `UPDATE users SET loyalty_child_panel_claimed_at = NOW() WHERE id = $1 AND loyalty_child_panel_claimed_at IS NULL`,
        [user.id],
        client
      );
    }
    return order!;
  });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code: string }).code === "23505") {
      throw new AppError("That domain already has a child panel order");
    }
    throw error;
  }

  await notify({
    userId: user.id,
    title: "Child panel order submitted",
    body: price > 0
      ? `₵${price.toFixed(2)} was charged for ${domain}. Point the domain to our nameservers while we set up the panel.`
      : `VIP complimentary child panel submitted for ${domain}. Point the domain to our nameservers while we set it up.`,
    type: "child_panel",
    metadata: { publicId: created.public_id },
  });
  const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL`);
  for (const admin of admins) {
    await notify({
      userId: admin.id,
      title: "New child panel order",
      body: `${user.full_name} ordered a child panel for ${domain} (${created.public_id}).`,
      type: "child_panel",
      metadata: { publicId: created.public_id, orderId: created.id },
    });
  }

  return publicOrder(created);
}

export async function listMyChildPanelOrders(userId: string) {
  const rows = await query(
    `SELECT ${listSelect}
     FROM child_panel_orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return rows.map(publicOrder);
}

export async function listChildPanelOrders(status?: string) {
  const params: unknown[] = [];
  const where = status ? (params.push(status), "WHERE o.status = $1") : "";
  return query(
    `SELECT ${listSelect}
     FROM child_panel_orders o
     JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY o.created_at DESC`,
    params
  );
}

export async function getChildPanelOrder(id: string, actor: AuthUser) {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT o.*, u.full_name, u.email
     FROM child_panel_orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 OR o.public_id = $1`,
    [id]
  );
  if (!row) throw new AppError("Child panel order not found", 404);
  if (actor.role !== "admin" && row.user_id !== actor.id) throw new AppError("Child panel order not found", 404);
  const base = publicOrder(row);
  if (actor.role !== "admin") return base;
  let adminPassword = "";
  try {
    adminPassword = decryptSecret(String(row.admin_password_encrypted));
  } catch {
    adminPassword = "";
  }
  return {
    ...base,
    full_name: row.full_name,
    email: row.email,
    admin_password: adminPassword,
    admin_note: row.admin_note,
    refunded_at: row.refunded_at,
    reviewed_at: row.reviewed_at,
  };
}

export async function reviewChildPanelOrder(
  id: string,
  actor: AuthUser,
  input: { status: "processing" | "active" | "rejected" | "cancelled"; note?: string },
  ip?: string
) {
  const allowed = ["processing", "active", "rejected", "cancelled"];
  if (!allowed.includes(input.status)) throw new AppError("Invalid child panel status");

  const result = await withTransaction(async (client) => {
    const order = await queryOne<Record<string, unknown>>(
      `SELECT * FROM child_panel_orders WHERE id = $1 FOR UPDATE`,
      [id],
      client
    );
    if (!order) throw new AppError("Child panel order not found", 404);
    if (order.status === input.status) return order;
    if (["rejected", "cancelled", "expired"].includes(String(order.status))) {
      throw new AppError("This child panel order is closed", 400);
    }

    if ((input.status === "rejected" || input.status === "cancelled") && Number(order.monthly_price) > 0 && !order.refunded_at) {
      const wallet = await queryOne<{ id: string; balance: string }>(
        `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [order.user_id],
        client
      );
      if (wallet) {
        const next = Number((Number(wallet.balance) + Number(order.monthly_price)).toFixed(4));
        await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [wallet.id, next], client);
        await query(
          `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description, created_by)
           VALUES ($1,$2,'refund',$3,$4,$5,$6,$7)`,
          [
            wallet.id,
            order.user_id,
            Number(order.monthly_price),
            next,
            order.public_id,
            `Child panel refund ${order.domain}`,
            actor.id,
          ],
          client
        );
      }
    }

    return queryOne<Record<string, unknown>>(
      `UPDATE child_panel_orders SET
         status = $2,
         admin_note = COALESCE($3, admin_note),
         reviewed_by = $4,
         reviewed_at = NOW(),
         provisioned_at = CASE WHEN $2 = 'active' THEN NOW() ELSE provisioned_at END,
         refunded_at = CASE WHEN $2 IN ('rejected', 'cancelled') AND monthly_price > 0 THEN NOW() ELSE refunded_at END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, input.status, input.note?.trim() || null, actor.id],
      client
    );
  });

  const labels: Record<string, string> = {
    processing: "We are setting up your child panel.",
    active: "Your child panel is active. Use the admin username you submitted.",
    rejected: "Your child panel order was not approved. Paid amounts were returned to your wallet.",
    cancelled: "Your child panel order was cancelled. Paid amounts were returned to your wallet.",
  };
  await notify({
    userId: String(result?.user_id),
    title: `Child panel ${input.status}`,
    body: input.note?.trim() || labels[input.status],
    type: "child_panel",
    metadata: { publicId: result?.public_id, status: input.status },
  });
  await writeAudit({
    actor,
    action: `child_panel.${input.status}`,
    targetType: "child_panel_order",
    targetId: id,
    details: { domain: result?.domain, status: input.status },
    ip,
  });
  return publicOrder(result!);
}
