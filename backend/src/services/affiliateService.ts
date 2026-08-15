import crypto from "node:crypto";
import type { Queryable } from "../db.js";
import { query, queryOne, withTransaction } from "../db.js";
import { getSettings } from "./settingsService.js";
import { notify } from "./notificationService.js";

export function newReferralCode() {
  return `LWH${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const row = await queryOne<{ referral_code: string | null }>(`SELECT referral_code FROM users WHERE id = $1`, [userId]);
  if (row?.referral_code) return row.referral_code;
  for (let i = 0; i < 6; i++) {
    const code = newReferralCode();
    try {
      const updated = await queryOne<{ referral_code: string }>(
        `UPDATE users SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL RETURNING referral_code`,
        [userId, code]
      );
      if (updated?.referral_code) return updated.referral_code;
    } catch {
      /* unique collision, retry */
    }
  }
  throw new Error("Could not allocate a referral code");
}

export async function findReferrerByCode(code?: string | null, client?: Queryable) {
  if (!code || !code.trim()) return null;
  const cleaned = code.trim().replace(/^.*[?&]ref=/i, "").split(/[/?#]/)[0];
  if (!cleaned) return null;
  return queryOne<{ id: string; full_name: string; referral_code: string }>(
    `SELECT id, full_name, referral_code FROM users WHERE UPPER(referral_code) = UPPER($1)`,
    [cleaned],
    client
  );
}

export async function attachReferrer(userId: string, code?: string | null, client?: Queryable) {
  const referrer = await findReferrerByCode(code, client);
  if (!referrer || referrer.id === userId) return null;
  const updated = await queryOne<{ id: string }>(
    `UPDATE users SET referred_by_id = $2
     WHERE id = $1 AND referred_by_id IS NULL
     RETURNING id`,
    [userId, referrer.id],
    client
  );
  return updated ? referrer : null;
}

export async function affiliateConfig() {
  const settings = await getSettings();
  const affiliates = (settings.affiliates ?? {}) as {
    enabled?: boolean;
    commissionPercent?: number;
    minimumPayout?: number;
    lifetime?: boolean;
  };
  return {
    enabled: affiliates.enabled !== false,
    commissionPercent: Number(affiliates.commissionPercent ?? 7),
    minimumPayout: Number(affiliates.minimumPayout ?? 10),
    lifetime: affiliates.lifetime !== false,
  };
}

export async function payReferralCommission(input: {
  depositorId: string;
  depositAmount: number;
  paymentId?: string | null;
  reference?: string;
}) {
  const cfg = await affiliateConfig();
  if (!cfg.enabled || input.depositAmount <= 0) return null;
  const depositor = await queryOne<{ referred_by_id: string | null }>(
    `SELECT referred_by_id FROM users WHERE id = $1`,
    [input.depositorId]
  );
  if (!depositor?.referred_by_id) return null;
  const already = await queryOne(
    `SELECT id FROM affiliate_commissions WHERE payment_id = $1`,
    [input.paymentId ?? null]
  );
  if (input.paymentId && already) return null;

  const commission = Number(((input.depositAmount * cfg.commissionPercent) / 100).toFixed(4));
  if (commission <= 0) return null;

  try {
    await withTransaction(async (client) => {
    await query(
      `INSERT INTO affiliate_commissions (referrer_id, referred_id, payment_id, deposit_amount, rate_percent, commission)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [depositor.referred_by_id, input.depositorId, input.paymentId ?? null, input.depositAmount, cfg.commissionPercent, commission],
      client
    );
    const wallet = await queryOne<{ id: string; balance: string }>(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [depositor.referred_by_id],
      client
    );
    let walletRow = wallet;
    if (!walletRow) {
      await query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`, [depositor.referred_by_id], client);
      walletRow = await queryOne<{ id: string; balance: string }>(
        `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [depositor.referred_by_id],
        client
      );
    }
    if (!walletRow) throw new Error("Referrer wallet missing");
    const next = Number((Number(walletRow.balance) + commission).toFixed(4));
    await query(`UPDATE wallets SET balance = $2 WHERE id = $1`, [walletRow.id, next], client);
    await query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, reference, description)
       VALUES ($1,$2,'affiliate_commission',$3,$4,$5,$6)`,
      [walletRow.id, depositor.referred_by_id, commission, next, input.reference ?? null, `Affiliate commission (${cfg.commissionPercent}%) from a referred deposit`],
      client
    );
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "23505") return null;
    throw err;
  }
  await notify({
    userId: depositor.referred_by_id,
    title: "Affiliate commission",
    body: `You earned commission from a referred user's deposit. It is already in your wallet and can be used to order services.`,
    type: "affiliate",
  });
  return commission;
}

export async function settleMissedCommissionsForDepositor(depositorId: string) {
  const deposits = await query<{ id: string; amount: string; reference: string | null }>(
    `SELECT p.id, p.amount, p.reference
     FROM payments p
     WHERE p.user_id = $1
       AND p.status = 'completed'
       AND COALESCE(p.metadata->>'purpose', 'deposit') <> 'reseller_upgrade'
       AND NOT EXISTS (SELECT 1 FROM affiliate_commissions c WHERE c.payment_id = p.id)`,
    [depositorId]
  );
  let paid = 0;
  for (const row of deposits) {
    const amount = await payReferralCommission({
      depositorId,
      depositAmount: Number(row.amount),
      paymentId: row.id,
      reference: row.reference ?? undefined,
    });
    if (amount) paid += amount;
  }
  return paid;
}

export async function settleMissedCommissionsForReferrer(referrerId: string) {
  const deposits = await query<{ id: string; amount: string; reference: string | null; user_id: string }>(
    `SELECT p.id, p.amount, p.reference, p.user_id
     FROM payments p
     JOIN users u ON u.id = p.user_id
     WHERE u.referred_by_id = $1
       AND p.status = 'completed'
       AND COALESCE(p.metadata->>'purpose', 'deposit') <> 'reseller_upgrade'
       AND NOT EXISTS (SELECT 1 FROM affiliate_commissions c WHERE c.payment_id = p.id)`,
    [referrerId]
  );
  let paid = 0;
  for (const row of deposits) {
    const amount = await payReferralCommission({
      depositorId: row.user_id,
      depositAmount: Number(row.amount),
      paymentId: row.id,
      reference: row.reference ?? undefined,
    });
    if (amount) paid += amount;
  }
  return paid;
}

export async function getMyAffiliate(userId: string) {
  const code = await ensureReferralCode(userId);
  await settleMissedCommissionsForReferrer(userId);
  const cfg = await affiliateConfig();
  const stats = await queryOne<{
    referred: string;
    commissions: string;
    commission_count: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE referred_by_id = $1) AS referred,
       COALESCE((SELECT SUM(commission) FROM affiliate_commissions WHERE referrer_id = $1), 0) AS commissions,
       (SELECT COUNT(*) FROM affiliate_commissions WHERE referrer_id = $1) AS commission_count`,
    [userId]
  );
  const referrals = await query(
    `SELECT id, full_name, email, created_at,
       (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE user_id = u.id AND type = 'deposit') AS deposited
     FROM users u WHERE referred_by_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  const history = await query(
    `SELECT c.*, u.full_name AS referred_name, u.email AS referred_email
     FROM affiliate_commissions c
     JOIN users u ON u.id = c.referred_id
     WHERE c.referrer_id = $1
     ORDER BY c.created_at DESC LIMIT 50`,
    [userId]
  );
  return {
    code,
    linkPath: `/r/${code}`,
    config: cfg,
    referredCount: Number(stats?.referred ?? 0),
    totalCommission: Number(stats?.commissions ?? 0),
    commissionCount: Number(stats?.commission_count ?? 0),
    referrals,
    history,
  };
}

export async function listAffiliatesAdmin() {
  return query(
    `SELECT u.id, u.full_name, u.email, u.referral_code,
       (SELECT COUNT(*) FROM users r WHERE r.referred_by_id = u.id) AS referred_count,
       COALESCE((SELECT SUM(commission) FROM affiliate_commissions c WHERE c.referrer_id = u.id), 0) AS total_commission
     FROM users u
     WHERE u.referral_code IS NOT NULL
        OR EXISTS (SELECT 1 FROM users r WHERE r.referred_by_id = u.id)
     ORDER BY total_commission DESC`
  );
}
