import { query, queryOne } from "../db.js";
import { writeAudit } from "./auditService.js";
import type { AuthUser } from "../middleware/auth.js";
import { encryptSecret, looksEncrypted } from "../utils.js";

const defaults: Record<string, unknown> = {
  general: {
    siteName: "LinkBoost Growth SMM",
    tagline: "Grow Your Social Presence With Powerful Social Media Services",
    supportEmail: "support@linkwavehub.com",
    contactPhone: "+233 00 000 0000",
    whatsappNumber: "",
    address: "Accra, Ghana",
    developer: "OB CodeLab",
    currency: "GHS",
    logoUrl: "",
    faviconUrl: "",
  },
  channels: {
    items: [] as { name: string; url: string; kind: string }[],
  },
  payments: {
    autoApproveMock: true,
    korapayCustomerPaysFees: true,
    korapayFeePercent: 1.5,
    korapayVatPercent: 15,
  },
  orders: {
    autoProcessing: true,
    maxPendingPerUser: 20,
    refundWindowHours: 48,
  },
  pricing: {
    customerMarkupPercent: 0,
    resellerMarkupPercent: 15,
    minimumProfitPer1000: 0.5,
    usdToGhs: 15.4,
    importMarkupPercent: 40,
  },
  notifications: {
    emailEnabled: false,
    orderNotifications: true,
    depositNotifications: true,
    refillNotifications: true,
  },
  affiliates: {
    enabled: true,
    commissionPercent: 7,
    minimumPayout: 10,
    lifetime: true,
  },
  resellers: {
    upgradeEnabled: true,
    upgradeFee: 200,
    upgradeNote:
      "Pay the reseller upgrade fee by Mobile Money. After you pay, an admin confirms the payment and switches your dashboard to reseller.",
  },
  childPanels: {
    enabled: true,
    monthlyPrice: 220,
    nameservers: ["dns1.cloudns.net", "dns2.cloudns.net"],
    currencies: [
      { code: "USD", name: "U.S. Dollar (USD)" },
      { code: "EUR", name: "Euro (EUR)" },
      { code: "GBP", name: "Pound Sterling (GBP)" },
      { code: "GHS", name: "Ghana Cedi (GHS)" },
      { code: "NGN", name: "Nigerian Naira (NGN)" },
      { code: "INR", name: "Indian Rupee (INR)" },
    ],
  },
  api: {
    enabled: true,
    defaultRateLimit: 100,
    resellerRateLimit: 500,
    premiumRateLimit: 2000,
    requireHttpsWebhooks: true,
    maxKeysPerDeveloper: 10,
    maxWebhooksPerDeveloper: 5,
  },
  loyalty: {
    newSpendGhs: 1000,
    frequentSpendGhs: 5000,
    vipSpendGhs: 10000,
    frequentDiscountPercent: 2,
    vipDiscountPercent: 10,
    lotteryUsd: 100,
  },
  mail: {
    enabled: true,
    host: "",
    port: 587,
    user: "",
    pass: "",
    from: "LinkBoost Growth SMM <support@linkboostgrowth.com>",
  },
};

function mergeSetting(key: string, stored: unknown) {
  const fallback = defaults[key];
  if (
    fallback &&
    typeof fallback === "object" &&
    !Array.isArray(fallback) &&
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored)
  ) {
    const merged = { ...(fallback as Record<string, unknown>), ...(stored as Record<string, unknown>) };
    if (key === "general" && /linkwave/i.test(String(merged.siteName ?? ""))) {
      merged.siteName = "LinkBoost Growth SMM";
    }
    return merged;
  }
  return stored ?? fallback;
}

export async function getSettings() {
  const rows = await query<{ key: string; value: unknown }>(`SELECT key, value FROM settings`);
  const map: Record<string, unknown> = { ...defaults };
  for (const row of rows) map[row.key] = mergeSetting(row.key, row.value);
  return map;
}

export async function getPublicSettings() {
  const all = await getSettings();
  const general = all.general as Record<string, unknown>;
  const channels = all.channels as { items?: { name: string; url: string; kind: string }[] };
  return {
    siteName: general.siteName,
    tagline: general.tagline,
    supportEmail: general.supportEmail,
    contactPhone: general.contactPhone,
    whatsappNumber: general.whatsappNumber,
    developer: general.developer,
    currency: general.currency,
    logoUrl: general.logoUrl,
    usdToGhs: Number((all.pricing as Record<string, unknown>)?.usdToGhs ?? 15.4),
    channels: (channels.items ?? []).filter((item) => item?.name && item?.url),
    affiliates: all.affiliates,
    payments: {
      korapayCustomerPaysFees: (all.payments as Record<string, unknown>)?.korapayCustomerPaysFees !== false,
      korapayFeePercent: Number((all.payments as Record<string, unknown>)?.korapayFeePercent ?? 1.5),
      korapayVatPercent: Number((all.payments as Record<string, unknown>)?.korapayVatPercent ?? 15),
    },
    resellers: {
      upgradeEnabled: (all.resellers as Record<string, unknown>).upgradeEnabled !== false,
      upgradeFee: Number((all.resellers as Record<string, unknown>).upgradeFee ?? 0),
      upgradeNote: String((all.resellers as Record<string, unknown>).upgradeNote ?? ""),
    },
  };
}

export async function getResellerUpgradeSettings() {
  const all = await getSettings();
  const general = all.general as Record<string, unknown>;
  const resellers = all.resellers as Record<string, unknown>;
  return {
    upgradeEnabled: resellers.upgradeEnabled !== false,
    upgradeFee: Number(resellers.upgradeFee ?? 0),
    upgradeNote: String(resellers.upgradeNote ?? ""),
    currency: String(general.currency ?? "GHS"),
  };
}

export type ChildPanelCurrency = { code: string; name: string };

export async function getChildPanelSettings() {
  const all = await getSettings();
  const general = all.general as Record<string, unknown>;
  const childPanels = all.childPanels as Record<string, unknown>;
  const nameservers = Array.isArray(childPanels.nameservers)
    ? childPanels.nameservers.map((item) => String(item).trim()).filter(Boolean)
    : ["dns1.cloudns.net", "dns2.cloudns.net"];
  const currencies = Array.isArray(childPanels.currencies)
    ? (childPanels.currencies as ChildPanelCurrency[]).filter((item) => item?.code && item?.name)
    : [];
  return {
    enabled: childPanels.enabled !== false,
    monthlyPrice: Number(childPanels.monthlyPrice ?? 220),
    nameservers: nameservers.length ? nameservers : ["dns1.cloudns.net", "dns2.cloudns.net"],
    currencies: currencies.length ? currencies : [{ code: "USD", name: "U.S. Dollar (USD)" }],
    currency: String(general.currency ?? "GHS"),
  };
}

export async function getAdminSettings() {
  const all = await getSettings();
  const mail = { ...((all.mail as Record<string, unknown> | undefined) ?? {}) };
  const passSet = Boolean(mail.pass);
  mail.pass = "";
  mail.passSet = passSet;
  return { ...all, mail };
}

export async function updateSettings(key: string, value: unknown, actor: AuthUser, ip?: string) {
  let stored = value;
  if (key === "mail" && value && typeof value === "object" && !Array.isArray(value)) {
    const incoming = { ...(value as Record<string, unknown>) };
    const current = ((await getSettings()).mail as Record<string, unknown> | undefined) ?? {};
    const nextPass = String(incoming.pass ?? "").trim();
    if (!nextPass) incoming.pass = current.pass ?? "";
    else if (!looksEncrypted(nextPass)) incoming.pass = encryptSecret(nextPass);
    stored = incoming;
  }
  await query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(stored), actor.id]
  );
  const auditDetails = key === "mail" && stored && typeof stored === "object"
    ? { ...(stored as Record<string, unknown>), pass: (stored as Record<string, unknown>).pass ? "[set]" : "" }
    : stored;
  await writeAudit({ actor, action: "settings.update", targetType: "settings", targetId: key, details: auditDetails, ip });
  return getAdminSettings();
}
