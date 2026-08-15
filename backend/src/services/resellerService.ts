import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { like, makeSlug, uniqueSlug } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import type { AuthUser } from "../middleware/auth.js";
import { getResellerUpgradeSettings } from "./settingsService.js";
import { getLoyaltyForUser } from "./loyaltyService.js";
import { publicProductName } from "./catalogClassify.js";
import { initiateDirectedPayment } from "./walletService.js";

export type PanelStore = {
  id: string;
  store_name: string;
  store_slug: string;
  logo_url: string | null;
  brand_color: string;
  tagline: string | null;
  markup_percent: number | string;
  status: string;
};

export async function getActivePanelBySlug(slug?: string | null) {
  const value = String(slug || "").trim().toLowerCase();
  if (!value) return null;
  return queryOne<PanelStore>(
    `SELECT id, store_name, store_slug, logo_url, brand_color, tagline, markup_percent, status
     FROM resellers WHERE store_slug = $1 AND status = 'active'`,
    [value]
  );
}

export async function getPanelForUser(userId: string) {
  return queryOne<PanelStore>(
    `SELECT r.id, r.store_name, r.store_slug, r.logo_url, r.brand_color, r.tagline, r.markup_percent, r.status
     FROM users u
     JOIN resellers r ON r.id = u.panel_reseller_id
     WHERE u.id = $1 AND r.status = 'active'`,
    [userId]
  );
}

export async function attachPanelCustomer(userId: string, storeSlug?: string | null) {
  const panel = await getActivePanelBySlug(storeSlug);
  if (!panel) return null;
  const user = await queryOne<{ id: string; role: string; panel_reseller_id: string | null }>(
    `SELECT id, role, panel_reseller_id FROM users WHERE id = $1`,
    [userId]
  );
  if (!user || user.role !== "customer") return null;
  if (user.panel_reseller_id) return getPanelForUser(userId);
  await query(
    `UPDATE users SET panel_reseller_id = $2
     WHERE id = $1 AND panel_reseller_id IS NULL AND role = 'customer'`,
    [userId, panel.id]
  );
  return getPanelForUser(userId);
}

export async function listResellerCustomers(userId: string) {
  const reseller = await queryOne<{ id: string }>(`SELECT id FROM resellers WHERE user_id = $1`, [userId]);
  if (!reseller) throw new AppError("Reseller profile not found", 404);
  return query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at, u.last_login_at,
            COALESCE(w.balance, 0) AS balance,
            (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id AND o.reseller_id = $1) AS order_count,
            (SELECT COALESCE(SUM(o.charge), 0) FROM orders o WHERE o.user_id = u.id AND o.reseller_id = $1) AS spent
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.panel_reseller_id = $1
     ORDER BY u.created_at DESC`,
    [reseller.id]
  );
}

export async function getResellerCustomer(userId: string, customerId: string) {
  const reseller = await queryOne<{ id: string }>(`SELECT id FROM resellers WHERE user_id = $1`, [userId]);
  if (!reseller) throw new AppError("Reseller profile not found", 404);
  const customer = await queryOne(
    `SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at, u.last_login_at,
            COALESCE(w.balance, 0) AS balance
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.id = $1 AND u.panel_reseller_id = $2`,
    [customerId, reseller.id]
  );
  if (!customer) throw new AppError("Customer not found", 404);
  const orders = await query(
    `SELECT o.public_id, o.status, o.charge, o.quantity, o.target, o.created_at, p.name AS product_name
     FROM orders o JOIN products p ON p.id = o.product_id
     WHERE o.user_id = $1 AND o.reseller_id = $2
     ORDER BY o.created_at DESC LIMIT 50`,
    [customerId, reseller.id]
  );
  return { customer, orders };
}

export async function listResellers(status?: string) {
  const params: unknown[] = [];
  const where = status ? (params.push(status), "WHERE r.status = $1") : "";
  return query(
    `SELECT r.*, u.full_name, u.email, u.status AS user_status, w.balance AS wallet_balance,
      (SELECT COUNT(*)::int FROM orders o WHERE o.reseller_id = r.id) AS order_count,
      (SELECT COALESCE(SUM(reseller_profit),0) FROM orders o WHERE o.reseller_id = r.id) AS total_profit
     FROM resellers r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN wallets w ON w.user_id = u.id
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );
}

export async function getReseller(id: string) {
  const reseller = await queryOne(
    `SELECT r.*, u.full_name, u.email, w.balance AS wallet_balance
     FROM resellers r JOIN users u ON u.id = r.user_id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE r.id = $1 OR r.user_id::text = $1 OR r.store_slug = $1`,
    [id]
  );
  if (!reseller) throw new AppError("Reseller not found", 404);
  const products = await query(
    `SELECT rp.*, p.name, p.price_per_1000, p.reseller_price_per_1000, p.status AS product_status
     FROM reseller_products rp JOIN products p ON p.id = rp.product_id
     WHERE rp.reseller_id = $1`,
    [reseller.id]
  );
  const orders = await query(
    `SELECT o.public_id, o.status, o.charge, o.reseller_profit, o.created_at, p.name AS product_name
     FROM orders o JOIN products p ON p.id = o.product_id
     WHERE o.reseller_id = $1 ORDER BY o.created_at DESC LIMIT 30`,
    [reseller.id]
  );
  return { reseller, products, orders };
}

export async function getPublicStorefront(slug: string, opts: {
  page?: number;
  limit?: number;
  platformId?: string;
  categoryId?: string;
  search?: string;
} = {}) {
  const reseller = await queryOne(
    `SELECT r.id, r.store_name, r.store_slug, r.logo_url, r.brand_color, r.tagline, r.markup_percent, r.status
     FROM resellers r WHERE r.store_slug = $1`,
    [slug]
  );
  if (!reseller || reseller.status !== "active") throw new AppError("Storefront not found", 404);

  const params: unknown[] = [reseller.id];
  const where = [
    `p.status = 'active'`,
    `pl.is_active = TRUE`,
    `p.reseller_available IS NOT FALSE`,
    `(rp.is_enabled IS NULL OR rp.is_enabled = TRUE)`,
    `p.name ~* '[A-Za-z]{3,}'`,
  ];
  if (opts.platformId) {
    params.push(opts.platformId);
    where.push(`(p.platform_id::text = $${params.length} OR pl.slug = $${params.length})`);
  }
  if (opts.categoryId) {
    params.push(opts.categoryId);
    where.push(`(p.category_id::text = $${params.length} OR c.slug = $${params.length})`);
  }
  const search = like(opts.search);
  if (search) {
    params.push(search);
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     JOIN resellers r ON r.id = $1
     LEFT JOIN reseller_products rp ON rp.reseller_id = r.id AND rp.product_id = p.id
     ${whereSql}`,
    params
  );

  const limit = Math.min(50, Math.max(1, Number(opts.limit ?? 24) || 24));
  const page = Math.max(1, Number(opts.page ?? 1) || 1);
  params.push(limit, (page - 1) * limit);
  const products = await query(
    `SELECT p.id, p.name, p.slug, p.description, p.min_quantity, p.max_quantity,
            p.avg_delivery_time, p.delivery_type, p.features, p.image_url, p.price_unit,
            p.refill_supported, p.refill_days, p.platform_id, p.category_id,
            pl.name AS platform_name, pl.slug AS platform_slug, pl.icon AS platform_icon, pl.color AS platform_color,
            c.name AS category_name, c.slug AS category_slug,
            COALESCE(rp.selling_price,
              ROUND(COALESCE(p.reseller_price_per_1000, p.price_per_1000) * (1 + r.markup_percent/100.0), 4)
            ) AS display_price_per_1000
     FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     JOIN resellers r ON r.id = $1
     LEFT JOIN reseller_products rp ON rp.reseller_id = r.id AND rp.product_id = p.id
     ${whereSql}
     ORDER BY pl.sort_order, c.sort_order, p.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const items = products.map((product) => ({
    ...product,
    name: publicProductName(String(product.name || "")),
  }));
  return {
    store: reseller,
    products: items,
    items,
    total: Number(countRow?.count ?? 0),
    page,
    limit,
  };
}

export async function setResellerStatus(id: string, status: string, actor: AuthUser, ip?: string) {
  const allowed = ["pending", "active", "suspended", "rejected"];
  if (!allowed.includes(status)) throw new AppError("Invalid reseller status");
  const row = await queryOne(`UPDATE resellers SET status = $2 WHERE id = $1 RETURNING *`, [id, status]);
  if (!row) throw new AppError("Reseller not found", 404);
  if (status === "active") {
    await query(`UPDATE users SET role = 'reseller', status = 'active' WHERE id = $1`, [row.user_id]);
    await notify({
      userId: row.user_id,
      title: "You are now a reseller",
      body: "Your account has been upgraded. Your dashboard now includes reseller / child panel tools: storefront, pricing and reseller orders.",
      type: "reseller",
    });
  } else {
    await notify({
      userId: row.user_id,
      title: "Reseller status updated",
      body: `Your reseller account is now ${status}.`,
      type: "reseller",
    });
  }
  await writeAudit({ actor, action: `reseller.${status}`, targetType: "reseller", targetId: id, ip });
  return row;
}

export async function updateStorefront(userId: string, input: Record<string, unknown>) {
  const current = await queryOne(`SELECT * FROM resellers WHERE user_id = $1`, [userId]);
  if (!current) throw new AppError("Reseller profile not found", 404);
  let slug = current.store_slug;
  if (input.storeName && input.storeName !== current.store_name) {
    slug = uniqueSlug(String(input.storeName));
  }
  return queryOne(
    `UPDATE resellers SET
      store_name = COALESCE($2, store_name),
      store_slug = $3,
      tagline = COALESCE($4, tagline),
      brand_color = COALESCE($5, brand_color),
      logo_url = COALESCE($6, logo_url),
      markup_percent = COALESCE($7, markup_percent)
     WHERE user_id = $1 RETURNING *`,
    [
      userId,
      input.storeName ?? null,
      slug,
      input.tagline ?? null,
      input.brandColor ?? null,
      input.logoUrl ?? null,
      input.markupPercent ?? null,
    ]
  );
}

export async function setResellerProductPrice(userId: string, productId: string, sellingPrice: number, isEnabled = true) {
  const reseller = await queryOne(`SELECT * FROM resellers WHERE user_id = $1`, [userId]);
  if (!reseller) throw new AppError("Reseller profile not found", 404);
  if (reseller.status !== "active") throw new AppError("Reseller account is not active", 403);
  const product = await queryOne(`SELECT reseller_price_per_1000, price_per_1000 FROM products WHERE id = $1`, [productId]);
  if (!product) throw new AppError("Product not found", 404);
  const floor = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
  if (sellingPrice < floor) throw new AppError(`Selling price cannot be below GHS ${floor.toFixed(2)} per 1000`);
  return queryOne(
    `INSERT INTO reseller_products (reseller_id, product_id, selling_price, is_enabled)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (reseller_id, product_id)
     DO UPDATE SET selling_price = EXCLUDED.selling_price, is_enabled = EXCLUDED.is_enabled
     RETURNING *`,
    [reseller.id, productId, sellingPrice, isEnabled]
  );
}

export async function resellerStats(userId: string) {
  const reseller = await queryOne(`SELECT * FROM resellers WHERE user_id = $1`, [userId]);
  if (!reseller) throw new AppError("Reseller profile not found", 404);
  const stats = await queryOne(
    `SELECT
       COUNT(*)::int AS orders,
       COALESCE(SUM(charge),0) AS sales,
       COALESCE(SUM(reseller_profit),0) AS profit,
       COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today_orders
     FROM orders WHERE reseller_id = $1`,
    [reseller.id]
  );
  const customers = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users WHERE panel_reseller_id = $1`,
    [reseller.id]
  );
  return { reseller, stats: { ...stats, customers: Number(customers?.count ?? 0) } };
}

const applicationSelect = `
  a.id, a.user_id, a.store_name, a.store_slug, a.fee_amount, a.currency, a.status,
  a.payment_id, a.method_code, a.sender_name, a.sender_number, a.note,
  a.reviewed_by, a.reviewed_at, a.created_at, a.updated_at,
  u.full_name, u.email, u.role,
  p.reference AS payment_reference, p.status AS payment_status, p.amount AS payment_amount,
  p.metadata AS payment_metadata, m.name AS method_name
`;

export async function getUpgradeOffer(user: AuthUser) {
  const settings = await getResellerUpgradeSettings();
  const application = await getMyUpgradeApplication(user.id);
  const reseller = await queryOne(`SELECT id, status, store_name, store_slug FROM resellers WHERE user_id = $1`, [user.id]);
  const vipComplimentary = user.role === "customer" && (await getLoyaltyForUser(user.id)).childPanelFree;
  const upgradeFee = vipComplimentary ? 0 : settings.upgradeFee;
  return {
    ...settings,
    upgradeFee,
    vipComplimentary,
    upgradeNote: vipComplimentary
      ? "VIP loyalty includes a complimentary child panel for 1 month (one-time). Submit your store name — no upgrade fee."
      : settings.upgradeNote,
    application,
    reseller,
    role: user.role,
  };
}

export async function getMyUpgradeApplication(userId: string) {
  return queryOne(
    `SELECT ${applicationSelect}
     FROM reseller_applications a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN payments p ON p.id = a.payment_id
     LEFT JOIN payment_methods m ON m.id = p.method_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC
     LIMIT 1`,
    [userId]
  );
}

export async function applyForResellerUpgrade(user: AuthUser, input: {
  storeName: string;
  methodCode?: string;
  senderName?: string;
  senderNumber?: string;
  returnUrl?: string;
}) {
  if (user.role === "admin") throw new AppError("Admins cannot apply for a reseller upgrade");
  const panel = await getPanelForUser(user.id);
  if (panel) throw new AppError("This account belongs to a child panel. Ask your panel owner if you need a storefront.");
  const settings = await getResellerUpgradeSettings();
  if (!settings.upgradeEnabled) throw new AppError("Reseller upgrades are not available right now");

  const existingReseller = await queryOne<{ status: string }>(`SELECT status FROM resellers WHERE user_id = $1`, [user.id]);
  if (existingReseller?.status === "active" || user.role === "reseller") {
    throw new AppError("This account is already a reseller");
  }

  const open = await queryOne(
    `SELECT id FROM reseller_applications WHERE user_id = $1 AND status IN ('pending_payment', 'pending_review')`,
    [user.id]
  );
  if (open) throw new AppError("You already have a pending reseller application");

  const vipComplimentary = user.role === "customer" && (await getLoyaltyForUser(user.id)).childPanelFree;
  const fee = vipComplimentary ? 0 : Number(settings.upgradeFee);
  if (fee < 0) throw new AppError("Upgrade fee is not configured");
  if (fee > 0 && !input.methodCode) throw new AppError("Choose a payment method");

  const storeName = input.storeName.trim();
  const storeSlug = uniqueSlug(storeName);
  let paymentId: string | null = null;
  let methodCode: string | null = input.methodCode ?? null;
  let instructions: string | null = null;
  let checkoutUrl: string | null = null;
  let reference: string | null = null;

  if (fee > 0) {
    const started = await initiateDirectedPayment(user, fee, String(input.methodCode), {
      purpose: "reseller_upgrade",
      storeName,
      callbackUrl: input.returnUrl,
    });
    paymentId = String(started.payment!.id);
    methodCode = String(started.method.code);
    instructions = started.instructions ?? null;
    checkoutUrl = started.checkoutUrl ?? null;
    reference = String(started.payment!.reference);
  }

  try {
    const application = await queryOne(
      `INSERT INTO reseller_applications (
         user_id, store_name, store_slug, fee_amount, currency, status,
         payment_id, method_code, sender_name, sender_number
       ) VALUES ($1,$2,$3,$4,$5,'pending_review',$6,$7,$8,$9)
       RETURNING *`,
      [
        user.id,
        storeName,
        storeSlug,
        fee,
        settings.currency,
        paymentId,
        methodCode,
        input.senderName?.trim() || null,
        input.senderNumber?.trim() || null,
      ]
    );
    if (paymentId) {
      await query(
        `UPDATE payments SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
        [paymentId, JSON.stringify({ applicationId: application?.id })]
      );
    }
    await notify({
      userId: user.id,
      title: "Reseller application submitted",
      body: fee > 0
        ? `Pay ${settings.currency} ${fee.toFixed(2)} by Mobile Money using reference ${reference}. An admin will promote you after confirming the payment.`
        : vipComplimentary
          ? "VIP complimentary child panel applied. An admin will activate your reseller dashboard."
          : "Your reseller application is waiting for admin approval.",
      type: "reseller",
    });
    return {
      application,
      payment: paymentId ? { id: paymentId, reference, amount: fee, instructions, checkoutUrl } : null,
      instructions,
      checkoutUrl,
    };
  } catch (error) {
    if (paymentId) {
      await query(`UPDATE payments SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`, [paymentId]);
    }
    throw error;
  }
}

export async function listResellerApplications(status?: string) {
  const params: unknown[] = [];
  const where = status ? (params.push(status), "WHERE a.status = $1") : "";
  return query(
    `SELECT ${applicationSelect}
     FROM reseller_applications a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN payments p ON p.id = a.payment_id
     LEFT JOIN payment_methods m ON m.id = p.method_id
     ${where}
     ORDER BY a.created_at DESC`,
    params
  );
}

async function loadApplicationByPaymentReference(reference: string) {
  const row = await queryOne<{ id: string }>(
    `SELECT a.id
     FROM reseller_applications a
     JOIN payments p ON p.id = a.payment_id
     WHERE p.reference = $1`,
    [reference]
  );
  if (!row) throw new AppError("Reseller application not found for this payment", 404);
  return row.id;
}

export async function approveUpgradeByPaymentReference(reference: string, actor: AuthUser | null, ip?: string) {
  const id = await loadApplicationByPaymentReference(reference);
  return approveResellerApplication(id, actor, ip);
}

export async function rejectUpgradeByPaymentReference(reference: string, actor: AuthUser, ip?: string) {
  const id = await loadApplicationByPaymentReference(reference);
  return rejectResellerApplication(id, actor, ip);
}

export async function approveResellerApplication(id: string, actor: AuthUser | null, ip?: string) {
  const result = await withTransaction(async (client) => {
    const application = await queryOne<Record<string, unknown>>(
      `SELECT * FROM reseller_applications WHERE id = $1 FOR UPDATE`,
      [id],
      client
    );
    if (!application) throw new AppError("Application not found", 404);
    if (application.status === "approved") return application;
    if (application.status === "rejected" || application.status === "cancelled") {
      throw new AppError("This application is closed", 400);
    }

    if (application.payment_id) {
      await query(
        `UPDATE payments SET status = 'completed' WHERE id = $1 AND status IN ('pending', 'completed')`,
        [application.payment_id],
        client
      );
    }

    const existing = await queryOne<Record<string, unknown>>(
      `SELECT * FROM resellers WHERE user_id = $1 FOR UPDATE`,
      [application.user_id],
      client
    );
    if (existing) {
      await query(
        `UPDATE resellers SET status = 'active', store_name = $2, updated_at = NOW() WHERE id = $1`,
        [existing.id, application.store_name],
        client
      );
    } else {
      try {
        await query(
          `INSERT INTO resellers (user_id, status, store_name, store_slug)
           VALUES ($1, 'active', $2, $3)`,
          [application.user_id, application.store_name, application.store_slug],
          client
        );
      } catch {
        await query(
          `INSERT INTO resellers (user_id, status, store_name, store_slug)
           VALUES ($1, 'active', $2, $3)`,
          [application.user_id, application.store_name, uniqueSlug(String(application.store_name))],
          client
        );
      }
    }

    await query(
      `UPDATE users SET role = 'reseller', status = 'active', updated_at = NOW() WHERE id = $1`,
      [application.user_id],
      client
    );
    if (Number(application.fee_amount) === 0) {
      await query(
        `UPDATE users SET loyalty_child_panel_claimed_at = NOW() WHERE id = $1 AND loyalty_child_panel_claimed_at IS NULL`,
        [application.user_id],
        client
      );
    }
    return queryOne(
      `UPDATE reseller_applications
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, actor?.id ?? null],
      client
    );
  });

  await notify({
    userId: String(result?.user_id),
    title: "You are now a reseller",
    body: "Payment confirmed. Your dashboard has switched to reseller / child panel. Open Reseller to set up your storefront.",
    type: "reseller",
  });
  await writeAudit({
    actor: actor ?? undefined,
    action: "reseller.upgrade.approve",
    targetType: "reseller_application",
    targetId: id,
    details: { userId: result?.user_id, storeName: result?.store_name, source: actor ? "admin" : "korapay" },
    ip,
  });
  return result;
}

export async function rejectResellerApplication(id: string, actor: AuthUser, ip?: string, reason?: string) {
  const result = await withTransaction(async (client) => {
    const application = await queryOne<Record<string, unknown>>(
      `SELECT * FROM reseller_applications WHERE id = $1 FOR UPDATE`,
      [id],
      client
    );
    if (!application) throw new AppError("Application not found", 404);
    if (application.status === "approved") throw new AppError("Approved applications cannot be rejected");
    if (application.payment_id) {
      await query(
        `UPDATE payments SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
        [application.payment_id],
        client
      );
    }
    return queryOne(
      `UPDATE reseller_applications
       SET status = 'rejected', note = COALESCE($3, note), reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, actor.id, reason ?? null],
      client
    );
  });
  await notify({
    userId: String(result?.user_id),
    title: "Reseller application declined",
    body: reason || "Your reseller / child panel application was not approved. Contact support if you already paid.",
    type: "reseller",
  });
  await writeAudit({
    actor,
    action: "reseller.upgrade.reject",
    targetType: "reseller_application",
    targetId: id,
    details: { reason },
    ip,
  });
  return result;
}

export { makeSlug };
