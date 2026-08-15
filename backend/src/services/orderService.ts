import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { calcCharge, decryptSecret, like, parsePagination, publicOrderId } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { adapterForLiveProvider, isMockProviderOrderId, mapPanelOrderStatus } from "../providers/smm/index.js";
import type { SmmStatusResult } from "../providers/smm/index.js";
import { summarizeRefill } from "./refillService.js";
import { publicProductName, looksLikePerUnitProduct } from "./catalogClassify.js";
import { getSettings } from "./settingsService.js";
import { enqueueOrderWebhook } from "./apiWebhookService.js";
import type { AuthUser } from "../middleware/auth.js";
import type { PoolClient } from "pg";

const orderSelect = `
  o.*, p.name AS product_name, p.slug AS product_slug,
  p.refill_supported, p.refill_days, p.refill_limit, p.provider_refill_supported, p.refill_instructions,
  pl.name AS platform_name, pl.slug AS platform_slug, pl.color AS platform_color, pl.icon AS platform_icon,
  c.name AS category_name,
  u.full_name AS customer_name, u.email AS customer_email,
  pr.name AS provider_name,
  (SELECT COUNT(*)::int FROM refills rf WHERE rf.order_id = o.id) AS refill_count,
  (SELECT rf.status::text FROM refills rf WHERE rf.order_id = o.id ORDER BY rf.created_at DESC LIMIT 1) AS latest_refill_status,
  (SELECT h.created_at FROM order_status_history h WHERE h.order_id = o.id AND h.to_status IN ('completed','partial') ORDER BY h.created_at DESC LIMIT 1) AS completed_at
`;

export async function quoteOrder(
  productId: string,
  quantity: number,
  user?: AuthUser | null,
  storeSlug?: string,
  options?: { viaApi?: boolean }
) {
  const product = await queryOne<Record<string, unknown>>(
    `SELECT p.*, pl.name AS platform_name FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     WHERE p.id = $1 AND p.status = 'active'`,
    [productId]
  );
  if (!product) throw new AppError("Product not found or inactive", 404);

  if (options?.viaApi && !product.api_available) {
    throw new AppError("This service is not available through the API", 403, "service_unavailable");
  }

  const minQty = options?.viaApi && Number(product.api_min_quantity) > 0
    ? Number(product.api_min_quantity)
    : Number(product.min_quantity);
  const maxQty = options?.viaApi && Number(product.api_max_quantity) > 0
    ? Number(product.api_max_quantity)
    : Number(product.max_quantity);
  if (quantity < minQty || quantity > maxQty) {
    throw new AppError(`Quantity must be between ${minQty} and ${maxQty}`);
  }

  let unit = Number(product.price_per_1000);
  let resellerId: string | null = null;
  let resellerCost = unit;

  if (!storeSlug && user?.role === "customer") {
    const panel = await queryOne<{ store_slug: string }>(
      `SELECT r.store_slug FROM users u JOIN resellers r ON r.id = u.panel_reseller_id
       WHERE u.id = $1 AND r.status = 'active'`,
      [user.id]
    );
    if (panel?.store_slug) storeSlug = panel.store_slug;
  }

  if (options?.viaApi) {
    const apiPrice = Number(product.api_price_per_1000);
    if (Number.isFinite(apiPrice) && apiPrice > 0) {
      unit = apiPrice;
    } else if (user?.role === "reseller") {
      unit = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
    }
  } else if (storeSlug) {
    if (product.reseller_available === false) {
      throw new AppError("This service is not available on this storefront", 404);
    }
    const store = await queryOne<Record<string, unknown>>(
      `SELECT r.*, rp.selling_price, rp.is_enabled FROM resellers r
       LEFT JOIN reseller_products rp ON rp.reseller_id = r.id AND rp.product_id = $2
       WHERE r.store_slug = $1 AND r.status = 'active'`,
      [storeSlug, productId]
    );
    if (store) {
      if (store.is_enabled === false) {
        throw new AppError("This service is not available on this storefront", 404);
      }
      resellerId = String(store.id);
      const resellerBase = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
      resellerCost = resellerBase;
      unit = store.selling_price != null
        ? Number(store.selling_price)
        : Number((resellerBase * (1 + Number(store.markup_percent) / 100)).toFixed(4));
    }
  } else if (user?.role === "reseller") {
    unit = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
  } else if (user?.role === "customer") {
    const { customerLoyaltyDiscountPercent, applyLoyaltyDiscount } = await import("./loyaltyService.js");
    unit = applyLoyaltyDiscount(unit, await customerLoyaltyDiscountPercent(user));
  }

  const priceUnit = product.price_unit === "each" || looksLikePerUnitProduct(
    String(product.name || ""),
    Number(product.min_quantity),
    Number(product.max_quantity),
    { cost: Number(product.cost_per_1000), providerServiceId: String(product.provider_service_id ?? "") }
  ) ? "each" as const : "per_1000" as const;
  const charge = calcCharge(unit, quantity, priceUnit);
  const cost = calcCharge(Number(product.cost_per_1000), quantity, priceUnit);
  return {
    product,
    quantity,
    unitPricePer1000: unit,
    priceUnit,
    charge,
    cost,
    profit: Number((charge - cost).toFixed(4)),
    resellerId,
    resellerCost,
  };
}

export async function placeOrder(input: {
  user: AuthUser;
  productId: string;
  quantity: number;
  target: string;
  storeSlug?: string;
  viaApi?: boolean;
  apiKeyId?: string;
}) {
  const target = input.target.trim();
  if (!/^https?:\/\//i.test(target) && !target.startsWith("@") && target.length < 3) {
    throw new AppError("Enter a valid profile, post URL, or username");
  }

  const created = await withTransaction(async (client) => {
    const quote = await quoteOrder(input.productId, input.quantity, input.user, input.storeSlug, {
      viaApi: input.viaApi,
    });
    const wallet = await queryOne<{ id: string; balance: string }>(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [input.user.id],
      client
    );
    if (!wallet) throw new AppError("Wallet not found", 400);
    const balance = Number(wallet.balance);
    if (balance < quote.charge) {
      throw new AppError("Insufficient wallet balance", 400);
    }

    const newBalance = Number((balance - quote.charge).toFixed(4));
    await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [wallet.id, newBalance], client);

    const publicId = publicOrderId();
    const priceUnit = quote.priceUnit ?? "per_1000";
    const resellerProfit =
      quote.resellerId != null
        ? Number((quote.charge - calcCharge(quote.resellerCost, input.quantity, priceUnit)).toFixed(4))
        : 0;
    const platformProfit = Number((calcCharge(quote.resellerId ? quote.resellerCost : Number(quote.product.price_per_1000), input.quantity, priceUnit) - quote.cost).toFixed(4));

    const order = await queryOne(
      `INSERT INTO orders (
        public_id, user_id, product_id, reseller_id, quantity, target,
        charge, cost, profit, reseller_profit, status, provider_id, source, api_key_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13)
      RETURNING *`,
      [
        publicId,
        input.user.id,
        input.productId,
        quote.resellerId,
        input.quantity,
        target,
        quote.charge,
        quote.cost,
        quote.resellerId ? platformProfit : quote.profit,
        resellerProfit,
        quote.product.provider_id,
        input.viaApi ? "api" : "dashboard",
        input.apiKeyId ?? null,
      ],
      client
    );

    await query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total)
       VALUES ($1,$2,$3,$4,$5)`,
      [order!.id, input.productId, input.quantity, quote.unitPricePer1000, quote.charge],
      client
    );
    await query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, NULL, 'pending', $2)`,
      [order!.id, input.user.id],
      client
    );
    await query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description, metadata)
       VALUES ($1,$2,'order_payment',$3,$4,$5,$6,$7::jsonb)`,
      [
        wallet.id,
        input.user.id,
        -quote.charge,
        newBalance,
        publicId,
        `Order ${publicId}`,
        JSON.stringify({ orderId: order!.id, productId: input.productId }),
      ],
      client
    );

    if (quote.resellerId && resellerProfit > 0) {
      await query(
        `UPDATE resellers SET profit_balance = profit_balance + $2, updated_at = NOW() WHERE id = $1`,
        [quote.resellerId, resellerProfit],
        client
      );
    }

    await notify({
      userId: input.user.id,
      title: "Order placed",
      body: `Order ${publicId} was created and is pending processing.`,
      type: "order",
      metadata: { orderId: order!.id, publicId },
    });
    await notify({
      userId: null,
      title: "New order",
      body: `${input.user.full_name} placed ${publicId} for ${quote.product.name}.`,
      type: "order",
      metadata: { orderId: order!.id, publicId },
    });

    return getOrderById(order!.id, client);
  });

  if (created?.id && (await shouldAutoSendOrders())) {
    try {
      await submitOrderToProvider(String(created.id), input.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provider rejected the order";
      await recordProviderSubmitFailure(String(created.id), created.status, input.user.id, message);
      await notify({
        userId: null,
        title: "Order not sent to provider",
        body: `Order ${created.public_id} was paid but the panel request failed: ${message}`,
        type: "order",
        metadata: { orderId: created.id, publicId: created.public_id },
      });
    }
  }

  if (input.viaApi && created?.id) {
    enqueueOrderWebhook(String(created.id), "order.created").catch((err) => console.error("API webhook enqueue failed", err));
  }
  return created?.id ? getOrderById(String(created.id)) : created;
}

export async function listOrders(opts: {
  user?: AuthUser;
  status?: string;
  platformId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  resellerOnly?: boolean;
  providerId?: string;
  refill?: string;
  source?: string;
}) {
  const { page, limit, offset } = parsePagination(opts as Record<string, unknown>);
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.user && opts.user.role !== "admin") {
    if (opts.resellerOnly) {
      params.push(opts.user.id);
      where.push(`o.reseller_id IN (SELECT id FROM resellers WHERE user_id = $${params.length})`);
    } else {
      params.push(opts.user.id);
      where.push(`o.user_id = $${params.length}`);
    }
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`o.status = $${params.length}`);
  }
  if (opts.platformId) {
    params.push(opts.platformId);
    where.push(`p.platform_id::text = $${params.length}`);
  }
  const search = like(opts.search);
  if (search) {
    params.push(search);
    where.push(`(o.public_id ILIKE $${params.length} OR o.target ILIKE $${params.length} OR u.email ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
  }
  if (opts.from) {
    params.push(opts.from);
    where.push(`o.created_at >= $${params.length}::timestamptz`);
  }
  if (opts.to) {
    params.push(opts.to);
    where.push(`o.created_at <= $${params.length}::timestamptz`);
  }
  if (opts.providerId) {
    params.push(opts.providerId);
    where.push(`COALESCE(o.provider_id, p.provider_id)::text = $${params.length}`);
  }
  if (opts.refill === "supported" || opts.refill === "yes") where.push(`p.refill_supported = TRUE`);
  if (opts.refill === "unsupported" || opts.refill === "no") where.push(`p.refill_supported = FALSE`);
  if (opts.refill === "available") {
    where.push(`p.refill_supported = TRUE
      AND o.status IN ('completed','partial')
      AND COALESCE((SELECT COUNT(*) FROM refills rf WHERE rf.order_id = o.id), 0) < p.refill_limit
      AND NOT EXISTS (SELECT 1 FROM refills rf WHERE rf.order_id = o.id AND rf.status IN ('requested','processing'))
      AND (
        COALESCE(
          (SELECT h.created_at FROM order_status_history h
            WHERE h.order_id = o.id AND h.to_status IN ('completed','partial')
            ORDER BY h.created_at DESC LIMIT 1),
          o.updated_at
        ) + (p.refill_days || ' days')::interval
      ) > NOW()`);
  }
  if (opts.refill && ["requested", "processing", "failed", "completed", "expired"].includes(opts.refill)) {
    params.push(opts.refill);
    where.push(`(SELECT rf.status::text FROM refills rf WHERE rf.order_id = o.id ORDER BY rf.created_at DESC LIMIT 1) = $${params.length}`);
  }
  if (opts.source) {
    params.push(opts.source);
    where.push(`o.source = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN users u ON u.id = o.user_id
     ${whereSql}`,
    params
  );
  params.push(limit, offset);
  const items = await query(
    `SELECT ${orderSelect}
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN providers pr ON pr.id = o.provider_id
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
    return {
    items: items.map((row) => withRefill(sanitizeOrder(row, opts.user?.role === "admin"))),
    total: Number(count?.count ?? 0),
    page,
    limit,
  };
}

export async function getOrder(idOrPublic: string, user: AuthUser) {
  const order = await queryOne(
    `SELECT ${orderSelect}
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN providers pr ON pr.id = o.provider_id
     WHERE o.id::text = $1 OR o.public_id = $1`,
    [idOrPublic]
  );
  if (!order) throw new AppError("Order not found", 404);
  if (user.role !== "admin" && order.user_id !== user.id) {
    const reseller = await queryOne(`SELECT id FROM resellers WHERE user_id = $1 AND id = $2`, [user.id, order.reseller_id]);
    if (!reseller) throw new AppError("Order not found", 404);
  }
  if (order.provider_order_id && !isMockProviderOrderId(order.provider_order_id)) {
    await syncOrderFromProvider(String(order.id)).catch(() => undefined);
    const fresh = await queryOne(
      `SELECT ${orderSelect}
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN platforms pl ON pl.id = p.platform_id
       JOIN categories c ON c.id = p.category_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN providers pr ON pr.id = o.provider_id
       WHERE o.id = $1`,
      [order.id]
    );
    if (fresh) Object.assign(order, fresh);
  }
  const history = await query(
    `SELECT h.*, u.full_name AS actor_name
     FROM order_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.order_id = $1 ORDER BY h.created_at ASC`,
    [order.id]
  );
  return { ...sanitizeOrder(order, user.role === "admin"), history, refill: summarizeRefill(order) };
}

async function getOrderById(id: string, client?: PoolClient) {
  return queryOne(
    `SELECT ${orderSelect}
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN categories c ON c.id = p.category_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN providers pr ON pr.id = o.provider_id
     WHERE o.id = $1`,
    [id],
    client
  );
}

export async function updateOrderStatus(input: {
  id: string;
  status: string;
  note?: string;
  actor: AuthUser;
  ip?: string;
}) {
  const allowed = ["pending", "processing", "in_progress", "completed", "partial", "cancelled", "refunded", "failed"];
  if (!allowed.includes(input.status)) throw new AppError("Invalid status");

  const result = await withTransaction(async (client) => {
    const current = await queryOne<Record<string, unknown>>(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [input.id],
      client
    );
    if (!current) throw new AppError("Order not found", 404);
    const from = String(current.status);
    if (from === input.status && !input.note) {
      return { current, from, changed: false };
    }

    if (input.status === "refunded" && from !== "refunded") {
      await refundOrderInternal(current, input.actor, client, input.note);
    } else {
      await query(`UPDATE orders SET status = $2, admin_note = COALESCE($3, admin_note) WHERE id = $1`, [
        input.id,
        input.status,
        input.note ?? null,
      ], client);
      await query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [input.id, from, input.status, input.note ?? null, input.actor.id],
        client
      );
    }
    return { current, from, changed: true };
  });

  if (result.changed) {
    await notify({
      userId: String(result.current.user_id),
      title: `Order ${result.current.public_id} updated`,
      body: `Status changed to ${input.status.replace("_", " ")}.`,
      type: "order",
      metadata: { orderId: result.current.id, status: input.status },
    });
    await writeAudit({
      actor: input.actor,
      action: "order.status_change",
      targetType: "order",
      targetId: input.id,
      details: { from: result.from, to: input.status, note: input.note },
      ip: input.ip,
    });
    const event = webhookEventForStatus(input.status);
    if (event) {
      enqueueOrderWebhook(input.id, event).catch((err) => console.error("API webhook enqueue failed", err));
    }
    if (input.status === "completed" || input.status === "partial") {
      const product = await queryOne<{ name: string; refill_supported: boolean; refill_days: number }>(
        `SELECT name, refill_supported, refill_days FROM products WHERE id = $1`,
        [result.current.product_id]
      );
      if (product?.refill_supported) {
        const notes = ((await getSettings()).notifications ?? {}) as { refillNotifications?: boolean };
        if (notes.refillNotifications !== false) {
          await notify({
            userId: String(result.current.user_id),
            title: `Your order ${result.current.public_id} is eligible for refill.`,
            body: `${product.name} can be refilled within ${product.refill_days} days. Open the order to request a refill.`,
            type: "order",
            metadata: { orderId: result.current.id, publicId: result.current.public_id },
          });
        }
      }
    }
  }
  return getOrder(input.id, input.actor);
}

export async function refundOrder(id: string, actor: AuthUser, note?: string, ip?: string) {
  return updateOrderStatus({ id, status: "refunded", note, actor, ip });
}

export async function cancelApiOrder(idOrPublic: string, user: AuthUser, ip?: string) {
  const current = await queryOne<Record<string, unknown>>(
    `SELECT * FROM orders WHERE id::text = $1 OR public_id = $1`,
    [idOrPublic]
  );
  if (!current) throw new AppError("Order not found", 404);
  if (user.role !== "admin" && current.user_id !== user.id) throw new AppError("Order not found", 404);

  const status = String(current.status);
  if (["completed", "partial", "refunded", "cancelled", "failed"].includes(status)) {
    throw new AppError("This order can no longer be cancelled", 400, "not_cancellable");
  }
  if (status !== "pending" && current.provider_order_id) {
    throw new AppError("This order is already with the provider and cannot be cancelled through the API", 400, "not_cancellable");
  }

  await withTransaction(async (client) => {
    const locked = await queryOne<Record<string, unknown>>(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [current.id],
      client
    );
    if (!locked) throw new AppError("Order not found", 404);
    const from = String(locked.status);
    if (["completed", "partial", "refunded", "cancelled", "failed"].includes(from)) {
      throw new AppError("This order can no longer be cancelled", 400, "not_cancellable");
    }
    await refundOrderInternal(locked, user, client, "Cancelled through API");
    await query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [locked.id], client);
    await query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by)
       VALUES ($1,'refunded','cancelled','Cancelled through API',$2)`,
      [locked.id, user.id],
      client
    );
  });
  enqueueOrderWebhook(String(current.id), "order.cancelled").catch((err) => console.error("API webhook enqueue failed", err));
  return getOrder(String(current.id), user);
}

function webhookEventForStatus(status: string) {
  const map: Record<string, string> = {
    processing: "order.processing",
    in_progress: "order.processing",
    completed: "order.completed",
    partial: "order.partial",
    failed: "order.failed",
    refunded: "order.refunded",
    cancelled: "order.cancelled",
  };
  return map[status] || null;
}

async function refundOrderInternal(
  order: Record<string, unknown>,
  actor: AuthUser,
  client: PoolClient,
  note?: string
) {
  if (order.status === "refunded") throw new AppError("Order already refunded");
  const wallet = await queryOne<{ id: string; balance: string }>(
    `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [order.user_id],
    client
  );
  if (!wallet) throw new AppError("Wallet not found", 400);
  const amount = Number(order.charge);
  const newBalance = Number((Number(wallet.balance) + amount).toFixed(4));
  await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [wallet.id, newBalance], client);
  await query(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description, created_by)
     VALUES ($1,$2,'refund',$3,$4,$5,$6,$7)`,
    [wallet.id, order.user_id, amount, newBalance, order.public_id, note || `Refund for ${order.public_id}`, actor.id],
    client
  );
  await query(`UPDATE orders SET status = 'refunded', admin_note = COALESCE($2, admin_note) WHERE id = $1`, [
    order.id,
    note ?? null,
  ], client);
  await query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by)
     VALUES ($1,$2,'refunded',$3,$4)`,
    [order.id, order.status, note ?? "Refunded", actor.id],
    client
  );
  await notify({
    userId: String(order.user_id),
    title: "Refund issued",
    body: `GHS ${amount.toFixed(2)} was refunded for order ${order.public_id}.`,
    type: "refund",
  });
}

export async function retryOrder(id: string, actor: AuthUser, ip?: string) {
  await submitOrderToProvider(id, actor, ip);
  return getOrder(id, actor);
}

export async function refreshOrderFromProvider(id: string, actor: AuthUser) {
  const updated = await syncOrderFromProvider(id);
  if (!updated) throw new AppError("This order has no live provider order to refresh");
  return getOrder(id, actor);
}

let orderSyncRunning = false;

export async function syncOpenOrdersFromProvider() {
  if (orderSyncRunning) return { checked: 0, updated: 0, skipped: true };
  orderSyncRunning = true;
  try {
    const open = await query<Record<string, unknown>>(
      `SELECT o.id, o.provider_order_id, o.status, o.user_id, o.public_id, o.product_id, o.charge,
              pr.adapter, pr.api_url, pr.api_key_encrypted
       FROM orders o
       JOIN products p ON p.id = o.product_id
       LEFT JOIN providers pr ON pr.id = COALESCE(o.provider_id, p.provider_id)
       WHERE o.provider_order_id IS NOT NULL
         AND o.provider_order_id NOT LIKE 'MOCK-%'
         AND (
           o.status IN ('pending', 'processing', 'in_progress', 'partial')
           OR (o.status IN ('completed', 'failed') AND (o.start_count IS NULL OR o.remains IS NULL))
         )
       ORDER BY o.updated_at ASC
       LIMIT 100`
    );
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of open) {
      const key = `${row.api_url || ""}::${row.adapter || ""}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    let updated = 0;
    for (const rows of groups.values()) {
      const first = rows[0];
      let apiKey: string | undefined;
      try {
        apiKey = decryptProviderKey(first.api_key_encrypted);
      } catch (err) {
        console.error("Order status sync skipped a provider", err instanceof Error ? err.message : err);
        continue;
      }
      if (!first.api_url || !apiKey) continue;
      const adapter = adapterForLiveProvider(first.adapter, true);
      const ids = rows.map((row) => String(row.provider_order_id));
      let statuses: Record<string, SmmStatusResult> = {};
      try {
        statuses = adapter.getStatuses
          ? await adapter.getStatuses(ids, { apiUrl: first.api_url as string, apiKey })
          : Object.fromEntries(
            await Promise.all(
              ids.map(async (id) => [id, await adapter.getStatus(id, { apiUrl: first.api_url as string, apiKey })] as const)
            )
          );
      } catch (err) {
        console.error("Order status sync failed", err instanceof Error ? err.message : err);
        continue;
      }
      for (const row of rows) {
        const snapshot = statuses[String(row.provider_order_id)];
        if (!snapshot) continue;
        try {
          if (await applyProviderSnapshot(row, snapshot)) updated += 1;
        } catch (err) {
          console.error("Order status apply failed", row.id, err instanceof Error ? err.message : err);
        }
      }
    }
    return { checked: open.length, updated };
  } finally {
    orderSyncRunning = false;
  }
}

async function shouldAutoSendOrders() {
  const settings = await getSettings();
  const orders = (settings.orders ?? {}) as { autoProcessing?: boolean };
  return orders.autoProcessing !== false;
}

async function loadOrderForProvider(id: string) {
  return queryOne<Record<string, unknown>>(
    `SELECT o.*, p.provider_service_id, p.provider_id AS product_provider_id,
            pr.adapter, pr.api_url, pr.api_key_encrypted, pr.status AS provider_status
     FROM orders o
     JOIN products p ON p.id = o.product_id
     LEFT JOIN providers pr ON pr.id = COALESCE(o.provider_id, p.provider_id)
     WHERE o.id = $1`,
    [id]
  );
}

function decryptProviderKey(encrypted: unknown): string | undefined {
  if (!encrypted) return undefined;
  try {
    const key = decryptSecret(String(encrypted));
    return key.trim() ? key : undefined;
  } catch {
    throw new AppError(
      "Could not decrypt the provider API key. Confirm ENCRYPTION_KEY matches the key used when the panel was saved.",
      500
    );
  }
}

function livePanelAdapter(order: Record<string, unknown>, apiKey: string | undefined) {
  const hasLiveCreds = Boolean(order.api_url && apiKey);
  if (!hasLiveCreds) {
    throw new AppError("This provider has no API URL or key. Add them in Admin → Providers.");
  }
  return adapterForLiveProvider(order.adapter, true);
}

async function submitOrderToProvider(id: string, actor: AuthUser, ip?: string) {
  const order = await loadOrderForProvider(id);
  if (!order) throw new AppError("Order not found", 404);

  const existingId = order.provider_order_id ? String(order.provider_order_id) : "";
  const alreadyLive = Boolean(existingId) && !isMockProviderOrderId(existingId);
  const status = String(order.status);
  if (alreadyLive && !["pending", "failed"].includes(status)) {
    throw new AppError("This order was already submitted to the provider. Refresh status instead of sending it again.");
  }
  if (!order.provider_service_id) {
    throw new AppError("This product has no provider service ID. Re-import the catalog or set the panel service ID.");
  }

  const apiKey = decryptProviderKey(order.api_key_encrypted);
  const adapter = livePanelAdapter(order, apiKey);

  let result;
  try {
    result = await adapter.createOrder(
      {
        serviceId: String(order.provider_service_id),
        link: String(order.target),
        quantity: Number(order.quantity),
      },
      { apiUrl: order.api_url as string | undefined, apiKey }
    );
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : "Provider rejected the order", 502);
  }

  if (!result.providerOrderId || isMockProviderOrderId(result.providerOrderId)) {
    throw new AppError("Provider did not return a live order ID");
  }

  await query(
    `UPDATE orders SET provider_order_id = $2, status = 'processing', admin_note = NULL, updated_at = NOW() WHERE id = $1`,
    [id, result.providerOrderId]
  );
  await query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by)
     VALUES ($1,$2,'processing',$3,$4)`,
    [id, order.status, `Submitted to provider (${result.providerOrderId})`, actor.id]
  );
  await writeAudit({ actor, action: "order.retry", targetType: "order", targetId: id, ip });
  enqueueOrderWebhook(id, "order.processing").catch((err) => console.error("API webhook enqueue failed", err));
}

async function recordProviderSubmitFailure(
  id: string,
  fromStatus: unknown,
  actorId: string,
  message: string
) {
  await query(
    `UPDATE orders SET admin_note = $2, updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
    [id, message]
  );
  await query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by)
     VALUES ($1,$2,'pending',$3,$4)`,
    [id, fromStatus ?? "pending", `Provider submit failed: ${message}`, actorId]
  );
}

async function syncOrderFromProvider(id: string) {
  const order = await loadOrderForProvider(id);
  if (!order) return false;
  const providerOrderId = order.provider_order_id ? String(order.provider_order_id) : "";
  if (!providerOrderId || isMockProviderOrderId(providerOrderId)) return false;

  const apiKey = decryptProviderKey(order.api_key_encrypted);
  const adapter = livePanelAdapter(order, apiKey);
  const result = await adapter.getStatus(providerOrderId, {
    apiUrl: order.api_url as string | undefined,
    apiKey,
  });
  return applyProviderSnapshot(order, result);
}

async function applyProviderSnapshot(order: Record<string, unknown>, result: SmmStatusResult) {
  const id = String(order.id);
  const localStatus = String(order.status);
  const nextStatus = mapPanelOrderStatus(result.status);
  const startCount = Number.isFinite(result.startCount) ? result.startCount ?? null : null;
  const remains = Number.isFinite(result.remains) ? result.remains ?? null : null;

  await query(
    `UPDATE orders SET start_count = COALESCE($2, start_count), remains = COALESCE($3, remains), updated_at = NOW() WHERE id = $1`,
    [id, startCount, remains]
  );

  if (!nextStatus || nextStatus === localStatus) return true;
  if (localStatus === "refunded") return true;

  if (nextStatus === "refunded") {
    const actor = await actorFromUserId(String(order.user_id));
    await withTransaction(async (client) => {
      const locked = await queryOne<Record<string, unknown>>(
        `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
        [id],
        client
      );
      if (!locked || locked.status === "refunded") return;
      await refundOrderInternal(locked, actor, client, `Refunded by provider (${result.status})`);
    });
    enqueueOrderWebhook(id, "order.refunded").catch((err) => console.error("API webhook enqueue failed", err));
    return true;
  }

  await query(`UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1`, [id, nextStatus]);
  await query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note)
     VALUES ($1,$2,$3,$4)`,
    [id, localStatus, nextStatus, `Provider status: ${result.status}`]
  );
  await announceProviderStatusChange(order, localStatus, nextStatus);
  return true;
}

async function actorFromUserId(userId: string): Promise<AuthUser> {
  const user = await queryOne<AuthUser>(
    `SELECT id, email, full_name, role, status FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) throw new AppError("User not found", 404);
  return user;
}

async function announceProviderStatusChange(
  order: Record<string, unknown>,
  fromStatus: string,
  nextStatus: string
) {
  await notify({
    userId: String(order.user_id),
    title: `Order ${order.public_id} updated`,
    body: `Status changed to ${nextStatus.replace(/_/g, " ")}.`,
    type: "order",
    metadata: { orderId: order.id, status: nextStatus, from: fromStatus },
  });
  const event = webhookEventForStatus(nextStatus);
  if (event) {
    enqueueOrderWebhook(String(order.id), event).catch((err) => console.error("API webhook enqueue failed", err));
  }
  if (nextStatus === "completed" || nextStatus === "partial") {
    const product = await queryOne<{ name: string; refill_supported: boolean; refill_days: number }>(
      `SELECT name, refill_supported, refill_days FROM products WHERE id = $1`,
      [order.product_id]
    );
    if (product?.refill_supported) {
      const notes = ((await getSettings()).notifications ?? {}) as { refillNotifications?: boolean };
      if (notes.refillNotifications !== false) {
        await notify({
          userId: String(order.user_id),
          title: `Your order ${order.public_id} is eligible for refill.`,
          body: `${product.name} can be refilled within ${product.refill_days} days. Open the order to request a refill.`,
          type: "order",
          metadata: { orderId: order.id, publicId: order.public_id },
        });
      }
    }
  }
}

function withRefill(order: Record<string, unknown>) {
  return { ...order, refill: summarizeRefill(order) };
}

function sanitizeOrder(row: Record<string, unknown>, admin = false) {
  const order = { ...row };
  if (!admin) {
    order.product_name = publicProductName(String(order.product_name || ""));
    delete order.cost;
    delete order.profit;
    delete order.provider_order_id;
    delete order.admin_note;
  }
  return order;
}
