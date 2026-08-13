import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { calcCharge, like, parsePagination, publicOrderId } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { getSmmAdapter } from "../providers/smm/index.js";
import { decryptSecret } from "../utils.js";
import { summarizeRefill } from "./refillService.js";
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

  if (options?.viaApi) {
    const apiPrice = Number(product.api_price_per_1000);
    if (Number.isFinite(apiPrice) && apiPrice > 0) {
      unit = apiPrice;
    } else if (user?.role === "reseller") {
      unit = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
    }
  } else if (storeSlug) {
    const store = await queryOne<Record<string, unknown>>(
      `SELECT r.*, rp.selling_price FROM resellers r
       LEFT JOIN reseller_products rp ON rp.reseller_id = r.id AND rp.product_id = $2
       WHERE r.store_slug = $1 AND r.status = 'active'`,
      [storeSlug, productId]
    );
    if (store) {
      resellerId = String(store.id);
      const resellerBase = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
      resellerCost = resellerBase;
      unit = store.selling_price != null
        ? Number(store.selling_price)
        : Number((resellerBase * (1 + Number(store.markup_percent) / 100)).toFixed(4));
    }
  } else if (user?.role === "reseller") {
    unit = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
  }

  const charge = calcCharge(unit, quantity);
  const cost = calcCharge(Number(product.cost_per_1000), quantity);
  return {
    product,
    quantity,
    unitPricePer1000: unit,
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
    const resellerProfit =
      quote.resellerId != null
        ? Number((quote.charge - calcCharge(quote.resellerCost, input.quantity)).toFixed(4))
        : 0;
    const platformProfit = Number((calcCharge(quote.resellerId ? quote.resellerCost : Number(quote.product.price_per_1000), input.quantity) - quote.cost).toFixed(4));

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
      const reseller = await queryOne<{ user_id: string }>(
        `SELECT user_id FROM resellers WHERE id = $1`,
        [quote.resellerId],
        client
      );
      if (reseller) {
        const rw = await queryOne<{ id: string; balance: string }>(
          `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [reseller.user_id],
          client
        );
        if (rw) {
          const rb = Number((Number(rw.balance) + resellerProfit).toFixed(4));
          await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [rw.id, rb], client);
          await query(
            `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description)
             VALUES ($1,$2,'reseller_commission',$3,$4,$5,$6)`,
            [rw.id, reseller.user_id, resellerProfit, rb, publicId, `Commission for ${publicId}`],
            client
          );
        }
      }
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

  if (input.viaApi && created?.id) {
    enqueueOrderWebhook(String(created.id), "order.created").catch((err) => console.error("API webhook enqueue failed", err));
  }
  return created;
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
  const order = await queryOne<Record<string, unknown>>(
    `SELECT o.*, p.provider_service_id, pr.adapter, pr.api_url, pr.api_key_encrypted
     FROM orders o
     JOIN products p ON p.id = o.product_id
     LEFT JOIN providers pr ON pr.id = COALESCE(o.provider_id, p.provider_id)
     WHERE o.id = $1`,
    [id]
  );
  if (!order) throw new AppError("Order not found", 404);
  const adapter = getSmmAdapter(String(order.adapter || "mock"));
  const apiKey = order.api_key_encrypted ? decryptSecret(String(order.api_key_encrypted)) : undefined;
  const result = await adapter.createOrder(
    {
      serviceId: String(order.provider_service_id || "0"),
      link: String(order.target),
      quantity: Number(order.quantity),
    },
    { apiUrl: order.api_url as string | undefined, apiKey }
  );
  await query(
    `UPDATE orders SET provider_order_id = $2, status = 'processing' WHERE id = $1`,
    [id, result.providerOrderId]
  );
  await query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by)
     VALUES ($1,$2,'processing',$3,$4)`,
    [id, order.status, `Submitted to provider (${result.providerOrderId})`, actor.id]
  );
  await writeAudit({ actor, action: "order.retry", targetType: "order", targetId: id, ip });
  enqueueOrderWebhook(id, "order.processing").catch((err) => console.error("API webhook enqueue failed", err));
  return getOrder(id, actor);
}

function withRefill(order: Record<string, unknown>) {
  return { ...order, refill: summarizeRefill(order) };
}

function sanitizeOrder(row: Record<string, unknown>, admin = false) {
  const order = { ...row };
  if (!admin) {
    delete order.cost;
    delete order.profit;
    delete order.provider_order_id;
  }
  return order;
}
