import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { getSettings } from "./settingsService.js";
import { creditWallet } from "./walletService.js";
import { notify } from "./notificationService.js";
import { writeAudit } from "./auditService.js";
import type { AuthUser } from "../middleware/auth.js";

export type LoyaltyTierId = "none" | "new" | "frequent" | "vip";

export type LoyaltyTier = {
  id: LoyaltyTierId;
  name: string;
  minSpendGhs: number;
  minSpendUsd: number;
  discountPercent: number;
  benefits: string[];
};

function benefitsFor(tier: LoyaltyTier): string[] {
  if (tier.id === "new") return ["24/7 Ticket Support", "WhatsApp Support"];
  if (tier.id === "frequent") {
    return ["All benefits in NEW tier", `${tier.discountPercent}% Discount on Services`, "WhatsApp Support"];
  }
  return [
    "All benefits in FREQUENT tier",
    `${tier.discountPercent}% Discount on Services`,
    "Free Child Panel for 1 Month",
    "$100 Monthly Lottery",
    "WhatsApp Support by Admin",
  ];
}

const DEFAULT_TIERS: LoyaltyTier[] = [
  { id: "new", name: "New Member", minSpendGhs: 1000, minSpendUsd: 100, discountPercent: 0, benefits: [] },
  { id: "frequent", name: "Frequent Member", minSpendGhs: 5000, minSpendUsd: 1000, discountPercent: 2, benefits: [] },
  { id: "vip", name: "VIP Member", minSpendGhs: 10000, minSpendUsd: 2500, discountPercent: 10, benefits: [] },
];

export async function loyaltyConfig() {
  const settings = await getSettings();
  const loyalty = (settings.loyalty ?? {}) as Record<string, unknown>;
  const pricing = (settings.pricing ?? {}) as Record<string, unknown>;
  const usdToGhs = Number(pricing.usdToGhs ?? 15.4);
  const tiers = DEFAULT_TIERS.map((tier) => {
    if (tier.id === "new") {
      return { ...tier, minSpendGhs: Number(loyalty.newSpendGhs ?? tier.minSpendGhs) };
    }
    if (tier.id === "frequent") {
      return {
        ...tier,
        minSpendGhs: Number(loyalty.frequentSpendGhs ?? tier.minSpendGhs),
        discountPercent: Number(loyalty.frequentDiscountPercent ?? tier.discountPercent),
      };
    }
    return {
      ...tier,
      minSpendGhs: Number(loyalty.vipSpendGhs ?? tier.minSpendGhs),
      discountPercent: Number(loyalty.vipDiscountPercent ?? tier.discountPercent),
    };
  }).map((tier) => ({ ...tier, benefits: benefitsFor(tier) }));
  return {
    tiers,
    lotteryUsd: Number(loyalty.lotteryUsd ?? 100),
    usdToGhs,
    lastLottery: (loyalty.lastLottery as Record<string, unknown> | null) ?? null,
  };
}

export async function spentForUser(userId: string) {
  const stats = await queryOne<{ spent: string }>(
    `SELECT COALESCE(ABS(SUM(amount) FILTER (WHERE type = 'order_payment')), 0) AS spent
     FROM wallet_transactions WHERE user_id = $1`,
    [userId]
  );
  return Number(stats?.spent ?? 0);
}

export function tierFromSpend(spent: number, tiers: LoyaltyTier[]): LoyaltyTier {
  const ranked = [...tiers].sort((a, b) => b.minSpendGhs - a.minSpendGhs);
  return ranked.find((tier) => spent >= tier.minSpendGhs) ?? {
    id: "none",
    name: "Member",
    minSpendGhs: 0,
    minSpendUsd: 0,
    discountPercent: 0,
    benefits: ["Place orders to unlock New Member at ₵1,000 spent"],
  };
}

export function applyLoyaltyDiscount(unit: number, percent: number) {
  if (!Number.isFinite(unit) || unit <= 0 || !percent) return unit;
  return Number((unit * (1 - percent / 100)).toFixed(4));
}

export async function getLoyaltyForUser(userId: string) {
  const cfg = await loyaltyConfig();
  const spent = await spentForUser(userId);
  const current = tierFromSpend(spent, cfg.tiers);
  const next = cfg.tiers.find((tier) => tier.minSpendGhs > current.minSpendGhs) ?? null;
  const claimed = await queryOne<{ loyalty_child_panel_claimed_at: string | null }>(
    `SELECT loyalty_child_panel_claimed_at FROM users WHERE id = $1`,
    [userId]
  );
  const childPanelClaimed = Boolean(claimed?.loyalty_child_panel_claimed_at);
  const lastLottery = cfg.lastLottery
    ? {
        name: String(cfg.lastLottery.name ?? "VIP member"),
        amount: Number(cfg.lastLottery.amount ?? 0),
        lotteryUsd: Number(cfg.lastLottery.lotteryUsd ?? cfg.lotteryUsd),
        drawnAt: String(cfg.lastLottery.drawnAt ?? ""),
      }
    : null;
  const remaining = next ? Math.max(0, next.minSpendGhs - spent) : 0;
  return {
    spent,
    tier: current.id,
    current,
    next,
    remaining,
    progressPercent: next
      ? Math.min(100, Math.round((spent / next.minSpendGhs) * 100))
      : 100,
    discountPercent: current.discountPercent,
    childPanelFree: current.id === "vip" && !childPanelClaimed,
    childPanelClaimed,
    lotteryUsd: cfg.lotteryUsd,
    lotteryGhs: Number((cfg.lotteryUsd * cfg.usdToGhs).toFixed(2)),
    lastLottery,
    tiers: cfg.tiers,
  };
}

export async function customerLoyaltyDiscountPercent(user?: { id: string; role: string } | null) {
  if (!user || user.role !== "customer") return 0;
  const panel = await queryOne(`SELECT panel_reseller_id FROM users WHERE id = $1`, [user.id]);
  if (panel?.panel_reseller_id) return 0;
  const loyalty = await getLoyaltyForUser(user.id);
  return loyalty.discountPercent;
}

export async function markChildPanelClaimed(userId: string) {
  await query(`UPDATE users SET loyalty_child_panel_claimed_at = NOW() WHERE id = $1 AND loyalty_child_panel_claimed_at IS NULL`, [userId]);
}

export async function drawVipLottery(actor: AuthUser, ip?: string) {
  const cfg = await loyaltyConfig();
  const vip = cfg.tiers.find((tier) => tier.id === "vip");
  if (!vip) throw new AppError("VIP tier is not configured", 500);
  const vips = await query<{ id: string; full_name: string; email: string; spent: string }>(
    `SELECT u.id, u.full_name, u.email, spent FROM (
        SELECT u.id, u.full_name, u.email,
               COALESCE(ABS((SELECT SUM(amount) FROM wallet_transactions w WHERE w.user_id = u.id AND w.type = 'order_payment')), 0) AS spent
        FROM users u
        WHERE u.role = 'customer' AND u.status = 'active'
      ) u
     WHERE spent >= $1`,
    [vip.minSpendGhs]
  );
  if (!vips.length) throw new AppError("No VIP members are eligible for the lottery yet", 400);
  const winner = vips[Math.floor(Math.random() * vips.length)];
  const amount = Number((cfg.lotteryUsd * cfg.usdToGhs).toFixed(4));
  await creditWallet({
    userId: winner.id,
    amount,
    type: "admin_adjustment",
    description: `VIP monthly lottery ($${cfg.lotteryUsd})`,
    createdBy: actor.id,
  });
  const lastLottery = {
    userId: winner.id,
    name: winner.full_name,
    email: winner.email,
    amount,
    lotteryUsd: cfg.lotteryUsd,
    drawnAt: new Date().toISOString(),
  };
  await query(
    `INSERT INTO settings (key, value) VALUES ('loyalty', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = COALESCE(settings.value, '{}'::jsonb) || $1::jsonb, updated_at = NOW()`,
    [JSON.stringify({ lastLottery })]
  );
  await notify({
    userId: winner.id,
    title: "VIP lottery winner",
    body: `You won this month’s VIP lottery. ${amount.toFixed(2)} GHS is in your wallet.`,
    type: "loyalty",
  });
  await writeAudit({
    actor,
    action: "loyalty.lottery",
    targetType: "user",
    targetId: winner.id,
    details: lastLottery,
    ip,
  });
  return lastLottery;
}
