import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { parsePagination } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { getPaymentAdapter } from "../providers/payment/index.js";
import { paymentReference } from "../utils.js";
import type { AuthUser } from "../middleware/auth.js";

export async function getWallet(userId: string) {
  const wallet = await queryOne(`SELECT * FROM wallets WHERE user_id = $1`, [userId]);
  if (!wallet) throw new AppError("Wallet not found", 404);
  const stats = await queryOne<{ deposits: string; spent: string }>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE type = 'deposit' OR (type = 'admin_adjustment' AND amount > 0) OR type = 'refund'), 0) AS deposits,
       COALESCE(ABS(SUM(amount) FILTER (WHERE type = 'order_payment')), 0) AS spent
     FROM wallet_transactions WHERE user_id = $1`,
    [userId]
  );
  return {
    ...wallet,
    total_deposits: Number(stats?.deposits ?? 0),
    total_spent: Number(stats?.spent ?? 0),
    available_balance: Number(wallet.balance),
  };
}

export async function listTransactions(userId: string, page = 1, limit = 20, adminUserId?: string) {
  const p = parsePagination({ page, limit });
  const target = adminUserId ?? userId;
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM wallet_transactions WHERE user_id = $1`,
    [target]
  );
  const items = await query(
    `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [target, p.limit, p.offset]
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function listPaymentMethods(includeDisabled = false) {
  const where = includeDisabled ? "" : "WHERE is_enabled = TRUE";
  const rows = await query(`SELECT id, code, name, description, adapter, is_enabled, sort_order, config FROM payment_methods ${where} ORDER BY sort_order, name`);
  return rows.map((row) => {
    const config = { ...(row.config as Record<string, unknown> | null) };
    delete config.secretKey;
    delete config.apiKey;
    return { ...row, config };
  });
}

export async function initiateDeposit(user: AuthUser, amount: number, methodCode: string) {
  const method = await queryOne<Record<string, unknown>>(
    `SELECT * FROM payment_methods WHERE code = $1 AND is_enabled = TRUE`,
    [methodCode]
  );
  if (!method) throw new AppError("Payment method is not available");

  const reference = paymentReference();
  const adapter = getPaymentAdapter(String(method.adapter));
  const init = await adapter.initialize({
    amount,
    currency: "GHS",
    email: user.email,
    reference,
    metadata: { userId: user.id },
    config: (method.config as Record<string, unknown>) || {},
  });

  const payment = await queryOne(
    `INSERT INTO payments (user_id, method_id, amount, currency, status, reference, provider_ref, metadata)
     VALUES ($1,$2,$3,'GHS',$4,$5,$6,$7::jsonb) RETURNING *`,
    [
      user.id,
      method.id,
      amount,
      init.autoComplete ? "completed" : "pending",
      init.reference,
      init.providerRef ?? null,
      JSON.stringify({ instructions: init.instructions, checkoutUrl: init.checkoutUrl }),
    ]
  );

  if (init.autoComplete) {
    await creditWallet({
      userId: user.id,
      amount,
      type: "deposit",
      reference: init.reference,
      description: `Deposit via ${method.name}`,
    });
    await notify({
      userId: user.id,
      title: "Deposit successful",
      body: `GHS ${amount.toFixed(2)} was added to your wallet.`,
      type: "deposit",
    });
  }

  return { payment, checkoutUrl: init.checkoutUrl, instructions: init.instructions };
}

export async function confirmPayment(reference: string, actor: AuthUser, ip?: string) {
  const payment = await queryOne<Record<string, unknown>>(
    `SELECT p.*, m.adapter, m.config, m.name AS method_name
     FROM payments p LEFT JOIN payment_methods m ON m.id = p.method_id
     WHERE p.reference = $1`,
    [reference]
  );
  if (!payment) throw new AppError("Payment not found", 404);
  if (payment.status === "completed") return payment;

  await creditWallet({
    userId: String(payment.user_id),
    amount: Number(payment.amount),
    type: "deposit",
    reference: String(payment.reference),
    description: `Deposit via ${payment.method_name || "manual"}`,
    createdBy: actor.id,
  });
  const updated = await queryOne(
    `UPDATE payments SET status = 'completed' WHERE id = $1 RETURNING *`,
    [payment.id]
  );
  await notify({
    userId: String(payment.user_id),
    title: "Deposit successful",
    body: `GHS ${Number(payment.amount).toFixed(2)} was added to your wallet.`,
    type: "deposit",
  });
  await writeAudit({ actor, action: "payment.confirm", targetType: "payment", targetId: String(payment.id), ip });
  return updated;
}

export async function rejectPayment(reference: string, actor: AuthUser, ip?: string) {
  const updated = await queryOne(
    `UPDATE payments SET status = 'cancelled' WHERE reference = $1 AND status = 'pending' RETURNING *`,
    [reference]
  );
  if (!updated) throw new AppError("Payment not found or already processed", 404);
  await writeAudit({ actor, action: "payment.reject", targetType: "payment", targetId: updated.id, ip });
  return updated;
}

export async function creditWallet(input: {
  userId: string;
  amount: number;
  type: "deposit" | "admin_adjustment" | "refund" | "reseller_commission";
  reference?: string;
  description: string;
  createdBy?: string;
}) {
  return withTransaction(async (client) => {
    const wallet = await queryOne<{ id: string; balance: string }>(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
      client
    );
    if (!wallet) throw new AppError("Wallet not found", 404);
    const next = Number((Number(wallet.balance) + input.amount).toFixed(4));
    if (next < 0) throw new AppError("Wallet balance cannot go below zero");
    await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [wallet.id, next], client);
    await query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [wallet.id, input.userId, input.type, input.amount, next, input.reference ?? null, input.description, input.createdBy ?? null],
      client
    );
    return next;
  });
}

export async function adminAdjustWallet(userId: string, amount: number, reason: string, actor: AuthUser, ip?: string) {
  const balance = await creditWallet({
    userId,
    amount,
    type: "admin_adjustment",
    description: reason || "Admin adjustment",
    createdBy: actor.id,
  });
  await writeAudit({
    actor,
    action: "wallet.adjustment",
    targetType: "user",
    targetId: userId,
    details: { amount, reason },
    ip,
  });
  await notify({
    userId,
    title: "Wallet updated",
    body: `An administrator ${amount >= 0 ? "added" : "removed"} GHS ${Math.abs(amount).toFixed(2)}. ${reason}`,
    type: "wallet",
  });
  return { balance };
}

export async function listPayments(opts: { status?: string; search?: string; page?: number; limit?: number }) {
  const p = parsePagination(opts as Record<string, unknown>);
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`p.status = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(p.reference ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM payments p JOIN users u ON u.id = p.user_id ${whereSql}`,
    params
  );
  params.push(p.limit, p.offset);
  const items = await query(
    `SELECT p.*, u.full_name, u.email, m.name AS method_name, m.code AS method_code
     FROM payments p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN payment_methods m ON m.id = p.method_id
     ${whereSql}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function togglePaymentMethod(id: string, isEnabled: boolean, actor: AuthUser, ip?: string) {
  const row = await queryOne(`UPDATE payment_methods SET is_enabled = $2 WHERE id = $1 RETURNING id, code, name, is_enabled`, [id, isEnabled]);
  if (!row) throw new AppError("Payment method not found", 404);
  await writeAudit({ actor, action: "payment_method.toggle", targetType: "payment_method", targetId: id, details: { isEnabled }, ip });
  return row;
}

export async function listAllWallets(search?: string) {
  const params: unknown[] = [];
  let where = "";
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE u.email ILIKE $1 OR u.full_name ILIKE $1`;
  }
  return query(
    `SELECT w.*, u.full_name, u.email, u.role, u.status AS user_status
     FROM wallets w JOIN users u ON u.id = w.user_id ${where}
     ORDER BY w.balance DESC`,
    params
  );
}
