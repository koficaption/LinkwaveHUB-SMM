import { query, queryOne, withTransaction, type Queryable } from "../db.js";
import { AppError } from "../errors.js";
import { uniqueSlug, parsePagination, paymentReference, safeCheckoutReturnUrl } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { getPaymentAdapter } from "../providers/payment/index.js";
import { ensureDepositCode } from "./depositCode.js";
import { config } from "../config.js";
import type { AuthUser } from "../middleware/auth.js";
import {
  getKorapayFeeSettings,
  isCardPaymentAdapter,
  quoteKorapayFees,
  type KorapayFeeQuote,
} from "./korapayFees.js";

export async function getWallet(userId: string) {
  const wallet = await queryOne(
    `SELECT w.*, u.deposit_code
     FROM wallets w
     JOIN users u ON u.id = w.user_id
     WHERE w.user_id = $1`,
    [userId]
  );
  if (!wallet) throw new AppError("Wallet not found", 404);
  const depositCode = String(wallet.deposit_code || (await ensureDepositCode(userId)));
  const stats = await queryOne<{ deposits: string; spent: string }>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE type = 'deposit' OR (type = 'admin_adjustment' AND amount > 0) OR type = 'refund'), 0) AS deposits,
       COALESCE(ABS(SUM(amount) FILTER (WHERE type = 'order_payment')), 0) AS spent
     FROM wallet_transactions WHERE user_id = $1`,
    [userId]
  );
  const pendingDeposits = await query(
    `SELECT id, amount, status, reference, deposit_code, created_at, metadata->>'instructions' AS instructions
     FROM payments
     WHERE user_id = $1
       AND status = 'pending'
       AND COALESCE(metadata->>'purpose', 'deposit') = 'deposit'
     ORDER BY created_at DESC
     LIMIT 8`,
    [userId]
  );
  return {
    ...wallet,
    deposit_code: depositCode,
    total_deposits: Number(stats?.deposits ?? 0),
    total_spent: Number(stats?.spent ?? 0),
    available_balance: Number(wallet.balance),
    pending_deposits: pendingDeposits,
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
  const korapayFees = await getKorapayFeeSettings();
  return rows.map((row) => {
    const methodConfig = { ...(row.config as Record<string, unknown> | null) };
    delete methodConfig.secretKey;
    delete methodConfig.apiKey;
    if (isCardPaymentAdapter(row.adapter)) {
      if (!methodConfig.publicKey && config.korapayPublicKey) {
        methodConfig.publicKey = config.korapayPublicKey;
      }
      methodConfig.customerPaysFees = korapayFees.customerPaysFees;
      methodConfig.feePercent = korapayFees.feePercent;
      methodConfig.vatPercent = korapayFees.vatPercent;
    }
    return { ...row, config: methodConfig };
  });
}

function paymentMetadata(payment: Record<string, unknown>) {
  const meta = payment.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, unknown>;
  return {};
}

async function korapayInitOptions(adapter: string, walletAmount: number) {
  if (!isCardPaymentAdapter(adapter)) {
    return {
      amount: walletAmount,
      merchantBearsCost: true,
      feeQuote: undefined as KorapayFeeQuote | undefined,
    };
  }
  const quote = quoteKorapayFees(walletAmount, await getKorapayFeeSettings());
  const addedFees = quote.chargedAmount > quote.walletAmount + 0.001;
  return {
    amount: quote.chargedAmount,
    merchantBearsCost: addedFees || !quote.customerPaysFees,
    feeQuote: quote,
  };
}

function feeMetadata(quote?: KorapayFeeQuote) {
  if (!quote || quote.chargedAmount <= quote.walletAmount) return {};
  return {
    chargedAmount: quote.chargedAmount,
    korapayFee: quote.fee,
    korapayVat: quote.vat,
    feePercent: quote.feePercent,
    vatPercent: quote.vatPercent,
  };
}

export function isResellerUpgradePayment(payment: Record<string, unknown>) {
  return paymentMetadata(payment).purpose === "reseller_upgrade";
}

export async function initiateDirectedPayment(
  user: AuthUser,
  amount: number,
  methodCode: string,
  extra: Record<string, unknown> = {}
) {
  const method = await queryOne<Record<string, unknown>>(
    `SELECT * FROM payment_methods WHERE code = $1 AND is_enabled = TRUE`,
    [methodCode]
  );
  if (!method) throw new AppError("Payment method is not available");

  const { callbackUrl: extraCallback, ...meta } = extra;
  const callbackUrl = safeCheckoutReturnUrl(
    typeof extraCallback === "string" ? extraCallback : undefined,
    "/app/become-reseller"
  );
  const depositCode = await ensureDepositCode(user.id);
  const adapterName = String(method.adapter);
  const reference = isCardPaymentAdapter(adapterName) || adapterName === "mock"
    ? paymentReference()
    : paymentReference(depositCode);
  const adapter = getPaymentAdapter(adapterName);
  const charge = await korapayInitOptions(adapterName, amount);
  const init = await adapter.initialize({
    amount: charge.amount,
    currency: "GHS",
    email: user.email,
    customerName: user.full_name,
    reference,
    customerReference: depositCode,
    metadata: { userId: user.id, depositCode, ...meta },
    config: (method.config as Record<string, unknown>) || {},
    callbackUrl,
    merchantBearsCost: charge.merchantBearsCost,
    feeQuote: charge.feeQuote,
  });

  const payment = await queryOne<Record<string, unknown>>(
    `INSERT INTO payments (user_id, method_id, amount, currency, status, reference, provider_ref, metadata, deposit_code)
     VALUES ($1,$2,$3,'GHS','pending',$4,$5,$6::jsonb,$7) RETURNING *`,
    [
      user.id,
      method.id,
      amount,
      init.reference,
      init.providerRef ?? null,
      JSON.stringify({
        instructions: init.instructions,
        checkoutUrl: init.checkoutUrl,
        depositCode,
        ...feeMetadata(charge.feeQuote),
        ...meta,
      }),
      depositCode,
    ]
  );

  return {
    payment,
    method,
    checkoutUrl: init.checkoutUrl,
    instructions: init.instructions,
    feeQuote: charge.feeQuote,
    depositCode,
  };
}

export async function initiateDeposit(user: AuthUser, amount: number, methodCode: string, returnUrl?: string) {
  const method = await queryOne<Record<string, unknown>>(
    `SELECT * FROM payment_methods WHERE code = $1 AND is_enabled = TRUE`,
    [methodCode]
  );
  if (!method) throw new AppError("Payment method is not available");

  const depositCode = await ensureDepositCode(user.id);
  const adapterName = String(method.adapter);
  const reference = isCardPaymentAdapter(adapterName) || adapterName === "mock"
    ? paymentReference()
    : paymentReference(depositCode);
  const adapter = getPaymentAdapter(adapterName);
  const charge = await korapayInitOptions(adapterName, amount);
  const init = await adapter.initialize({
    amount: charge.amount,
    currency: "GHS",
    email: user.email,
    customerName: user.full_name,
    reference,
    customerReference: depositCode,
    metadata: { userId: user.id, depositCode },
    config: (method.config as Record<string, unknown>) || {},
    callbackUrl: safeCheckoutReturnUrl(returnUrl, "/app/wallet"),
    merchantBearsCost: charge.merchantBearsCost,
    feeQuote: charge.feeQuote,
  });

  const payment = await queryOne(
    `INSERT INTO payments (user_id, method_id, amount, currency, status, reference, provider_ref, metadata, deposit_code)
     VALUES ($1,$2,$3,'GHS',$4,$5,$6,$7::jsonb,$8) RETURNING *`,
    [
      user.id,
      method.id,
      amount,
      init.autoComplete ? "completed" : "pending",
      init.reference,
      init.providerRef ?? null,
      JSON.stringify({
        instructions: init.instructions,
        checkoutUrl: init.checkoutUrl,
        depositCode,
        ...feeMetadata(charge.feeQuote),
      }),
      depositCode,
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
    const { payReferralCommission } = await import("./affiliateService.js");
    await payReferralCommission({
      depositorId: user.id,
      depositAmount: amount,
      paymentId: payment?.id,
      reference: init.reference,
    });
  }

  return {
    payment,
    checkoutUrl: init.checkoutUrl,
    instructions: init.instructions,
    feeQuote: charge.feeQuote,
    depositCode,
  };
}

function isCardAdapter(adapter: unknown) {
  return isCardPaymentAdapter(adapter);
}

function normalizeKorapayAmount(value: unknown, expected: number) {
  let paid = Number(value);
  if (!Number.isFinite(paid)) return expected;
  if (expected > 0 && paid > expected * 50) paid = paid / 100;
  return paid;
}

export async function completeVerifiedPayment(
  reference: string,
  opts: { userId?: string; actor?: AuthUser | null; ip?: string } = {}
) {
  const payment = await queryOne<Record<string, unknown>>(
    `SELECT p.*, m.adapter, m.config, m.name AS method_name
     FROM payments p LEFT JOIN payment_methods m ON m.id = p.method_id
     WHERE p.reference = $1`,
    [reference]
  );
  if (!payment) throw new AppError("Payment not found", 404);
  if (opts.userId && String(payment.user_id) !== opts.userId) {
    throw new AppError("Payment not found", 404);
  }
  const purpose = isResellerUpgradePayment(payment) ? "reseller_upgrade" : "deposit";
  if (payment.status === "completed") {
    return { payment, alreadyCompleted: true, purpose };
  }
  if (payment.status === "cancelled") {
    throw new AppError("This payment was cancelled", 400);
  }

  const adapter = getPaymentAdapter(String(payment.adapter || "manual"));
  const verified = await adapter.verify(String(payment.reference), (payment.config as Record<string, unknown>) || {});
  if (!verified.success) {
    throw new AppError("This payment has not been confirmed yet", 400);
  }
  if (verified.amount != null) {
    const expected = Number(payment.amount);
    const paid = normalizeKorapayAmount(verified.amount, expected);
    const raw = verified.raw && typeof verified.raw === "object" ? verified.raw as Record<string, unknown> : {};
    const charged = normalizeKorapayAmount(raw.amount_charged ?? raw.amount_paid ?? raw.amount, expected);
    const quotedCharge = Number(paymentMetadata(payment).chargedAmount ?? 0);
    const matchesWallet = Math.abs(paid - expected) <= 0.5;
    const matchesQuoted = quotedCharge > 0 && (
      Math.abs(paid - quotedCharge) <= 0.5 || Math.abs(charged - quotedCharge) <= 0.5
    );
    const includesFees = charged + 0.01 >= expected && charged <= expected * 1.25 + 10;
    if (!matchesWallet && !matchesQuoted && !includesFees) {
      throw new AppError("Paid amount does not match this invoice", 400);
    }
  }

  if (purpose === "reseller_upgrade") {
    await query(
      `UPDATE payments SET provider_ref = COALESCE($2, provider_ref), updated_at = NOW() WHERE id = $1`,
      [payment.id, verified.providerRef ?? null]
    );
    const { approveUpgradeByPaymentReference } = await import("./resellerService.js");
    const application = await approveUpgradeByPaymentReference(reference, opts.actor ?? null, opts.ip);
    return { payment: { ...payment, status: "completed" }, alreadyCompleted: false, purpose, application };
  }

  const result = await withTransaction(async (client) => {
    const locked = await queryOne<Record<string, unknown>>(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [payment.id],
      client
    );
    if (!locked) throw new AppError("Payment not found", 404);
    if (locked.status === "completed") return { row: locked, credited: false };
    await creditWallet(
      {
        userId: String(payment.user_id),
        amount: Number(payment.amount),
        type: "deposit",
        reference: String(payment.reference),
        description: `Deposit via ${payment.method_name || "Korapay"}`,
        createdBy: opts.actor?.id,
      },
      client
    );
    const row = await queryOne<Record<string, unknown>>(
      `UPDATE payments SET status = 'completed', provider_ref = COALESCE($2, provider_ref), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [payment.id, verified.providerRef ?? null],
      client
    );
    return { row, credited: true };
  });

  if (result.credited) {
    await notify({
      userId: String(payment.user_id),
      title: "Deposit successful",
      body: `GHS ${Number(payment.amount).toFixed(2)} was added to your wallet.`,
      type: "deposit",
    });
    if (opts.actor) {
      await writeAudit({
        actor: opts.actor,
        action: "payment.confirm",
        targetType: "payment",
        targetId: String(payment.id),
        ip: opts.ip,
      });
    }
    const { payReferralCommission } = await import("./affiliateService.js");
    await payReferralCommission({
      depositorId: String(payment.user_id),
      depositAmount: Number(payment.amount),
      paymentId: String(payment.id),
      reference: String(payment.reference),
    });
  }

  return { payment: result.row, alreadyCompleted: !result.credited, purpose };
}

export async function confirmPayment(reference: string, actor: AuthUser, ip?: string) {
  const payment = await queryOne<Record<string, unknown>>(
    `SELECT p.*, m.adapter, m.config, m.name AS method_name
     FROM payments p LEFT JOIN payment_methods m ON m.id = p.method_id
     WHERE p.reference = $1`,
    [reference]
  );
  if (!payment) throw new AppError("Payment not found", 404);
  if (isCardAdapter(payment.adapter)) {
    const result = await completeVerifiedPayment(reference, { actor, ip });
    return result.application ?? result.payment;
  }
  if (isResellerUpgradePayment(payment)) {
    const { approveUpgradeByPaymentReference } = await import("./resellerService.js");
    return approveUpgradeByPaymentReference(reference, actor, ip);
  }
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
  const { payReferralCommission } = await import("./affiliateService.js");
  await payReferralCommission({
    depositorId: String(payment.user_id),
    depositAmount: Number(payment.amount),
    paymentId: String(payment.id),
    reference: String(payment.reference),
  });
  return updated;
}

export async function rejectPayment(reference: string, actor: AuthUser, ip?: string) {
  const payment = await queryOne<Record<string, unknown>>(
    `SELECT p.*, m.name AS method_name
     FROM payments p LEFT JOIN payment_methods m ON m.id = p.method_id
     WHERE p.reference = $1`,
    [reference]
  );
  if (!payment) throw new AppError("Payment not found", 404);
  if (isResellerUpgradePayment(payment)) {
    const { rejectUpgradeByPaymentReference } = await import("./resellerService.js");
    return rejectUpgradeByPaymentReference(reference, actor, ip);
  }
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
  type: "deposit" | "admin_adjustment" | "refund" | "reseller_commission" | "affiliate_commission";
  reference?: string;
  description: string;
  createdBy?: string;
}, client?: Queryable) {
  const run = async (c: Queryable) => {
    const wallet = await queryOne<{ id: string; balance: string }>(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
      c
    );
    if (!wallet) throw new AppError("Wallet not found", 404);
    const next = Number((Number(wallet.balance) + input.amount).toFixed(4));
    if (next < 0) throw new AppError("Wallet balance cannot go below zero");
    await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [wallet.id, next], c);
    await query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [wallet.id, input.userId, input.type, input.amount, next, input.reference ?? null, input.description, input.createdBy ?? null],
      c
    );
    return next;
  };
  if (client) return run(client);
  return withTransaction(run);
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
    where.push(`(p.reference ILIKE $${params.length} OR p.deposit_code ILIKE $${params.length} OR u.deposit_code ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM payments p JOIN users u ON u.id = p.user_id ${whereSql}`,
    params
  );
  params.push(p.limit, p.offset);
  const items = await query(
    `SELECT p.*, u.full_name, u.email, u.deposit_code AS user_deposit_code,
            COALESCE(p.deposit_code, u.deposit_code) AS deposit_code,
            m.name AS method_name, m.code AS method_code,
            COALESCE(p.metadata->>'purpose', 'deposit') AS purpose
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
  return updatePaymentMethod(id, { isEnabled }, actor, ip);
}

export async function createPaymentMethod(input: {
  name: string;
  code?: string;
  description?: string | null;
  adapter?: string;
  isEnabled?: boolean;
  sortOrder?: number;
  config?: Record<string, unknown>;
}, actor: AuthUser, ip?: string) {
  const code = (input.code?.trim() || uniqueSlug(input.name)).toLowerCase();
  const row = await queryOne(
    `INSERT INTO payment_methods (code, name, description, adapter, is_enabled, sort_order, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id, code, name, description, adapter, is_enabled, sort_order, config`,
    [
      code,
      input.name,
      input.description ?? null,
      input.adapter ?? "manual",
      input.isEnabled !== false,
      input.sortOrder ?? 10,
      JSON.stringify(input.config ?? {}),
    ]
  );
  await writeAudit({ actor, action: "payment_method.create", targetType: "payment_method", targetId: row?.id, ip });
  return row;
}

export async function updatePaymentMethod(id: string, input: {
  name?: string;
  description?: string | null;
  adapter?: string;
  isEnabled?: boolean;
  sortOrder?: number;
  config?: Record<string, unknown>;
}, actor: AuthUser, ip?: string) {
  const current = await queryOne<Record<string, unknown>>(`SELECT * FROM payment_methods WHERE id = $1`, [id]);
  if (!current) throw new AppError("Payment method not found", 404);
  const nextConfig = { ...((current.config as Record<string, unknown>) || {}), ...(input.config || {}) };
  const row = await queryOne(
    `UPDATE payment_methods SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       adapter = COALESCE($4, adapter),
       is_enabled = COALESCE($5, is_enabled),
       sort_order = COALESCE($6, sort_order),
       config = $7::jsonb,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, code, name, description, adapter, is_enabled, sort_order, config`,
    [
      id,
      input.name ?? null,
      input.description ?? null,
      input.adapter ?? null,
      input.isEnabled ?? null,
      input.sortOrder ?? null,
      JSON.stringify(nextConfig),
    ]
  );
  await writeAudit({ actor, action: "payment_method.update", targetType: "payment_method", targetId: id, details: input, ip });
  return row;
}

export async function listAllWallets(search?: string) {
  const params: unknown[] = [];
  let where = "";
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE u.email ILIKE $1 OR u.full_name ILIKE $1 OR u.deposit_code ILIKE $1`;
  }
  return query(
    `SELECT w.*, u.full_name, u.email, u.role, u.status AS user_status, u.deposit_code
     FROM wallets w JOIN users u ON u.id = w.user_id ${where}
     ORDER BY w.balance DESC`,
    params
  );
}
