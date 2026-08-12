import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { calcCharge, like, parsePagination, publicOrderId } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { getSmmAdapter } from "../providers/smm/index.js";
import { decryptSecret } from "../utils.js";
import type { AuthUser } from "../middleware/auth.js";
import type { PoolClient } from "pg";

const orderSelect = `
  o.*, p.name AS product_name, p.slug AS product_slug,
  pl.name AS platform_name, pl.slug AS platform_slug, pl.color AS platform_color, pl.icon AS platform_icon,
  c.name AS category_name,
  u.full_name AS customer_name, u.email AS customer_email,
  pr.name AS provider_name
`;

export async function quoteOrder(productId: string, quantity: number, user?: AuthUser | null, storeSlug?: string) {
  const product = await queryOne<Record<string, unknown>>(
    `SELECT p.*, pl.name AS platform_name FROM products p
     JOIN platforms pl ON pl.id = p.platform_id
     WHERE p.id = $1 AND p.status = 'active'`,
    [productId]
  );
  if (!product) throw new AppError("Product not found or inactive", 404);
  if (quantity < Number(product.min_quantity) || quantity > Number(product.max_quantity)) {
    throw new AppError(`Quantity must be between ${product.min_quantity} and ${product.max_quantity}`);
  }

  let unit = Number(product.price_per_1000);
  let resellerId: string | null = null;
  let resellerCost = unit;

  if (storeSlug) {
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
}) {
  const target = input.target.trim();
  if (!/^https?:\/\//i.test(target) && !target.startsWith("@") && target.length < 3) {
    throw new AppError("Enter a valid profile, post URL, or username");
  }

  return withTransaction(async (client) => {
    const quote = await quoteOrder(input.productId, input.quantity, input.user, input.storeSlug);
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
        charge, cost, profit, reseller_profit, status, provider_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
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
    return { items: items.map((row) => sanitizeOrder(row)), total: Number(count?.count ?? 0), page, limit };
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
  return { ...sanitizeOrder(order, user.role === "admin"), history };
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

  return withTransaction(async (client) => {
    const order = await queryOne<Record<string, unknown>>(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [input.id],
      client
    );
    if (!order) throw new AppError("Order not found", 404);
    const from = String(order.status);
    if (from === input.status && !input.note) return getOrder(input.id, input.actor);

    if (input.status === "refunded" && from !== "refunded") {
      await refundOrderInternal(order, input.actor, client, input.note);
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

    await notify({
      userId: String(order.user_id),
      title: `Order ${order.public_id} updated`,
      body: `Status changed to ${input.status.replace("_", " ")}.`,
      type: "order",
      metadata: { orderId: order.id, status: input.status },
    });
    await writeAudit({
      actor: input.actor,
      action: "order.status_change",
      targetType: "order",
      targetId: input.id,
      details: { from, to: input.status, note: input.note },
      ip: input.ip,
    });
    return getOrder(input.id, input.actor);
  });
}

export async function refundOrder(id: string, actor: AuthUser, note?: string, ip?: string) {
  return updateOrderStatus({ id, status: "refunded", note, actor, ip });
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
  return getOrder(id, actor);
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
