import { query, queryOne } from "../db.js";
import { writeAudit } from "./auditService.js";
import type { AuthUser } from "../middleware/auth.js";

const defaults: Record<string, unknown> = {
  general: {
    siteName: "LinkWaveHub SMM",
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
  },
  orders: {
    autoProcessing: false,
    maxPendingPerUser: 20,
    refundWindowHours: 48,
  },
  pricing: {
    customerMarkupPercent: 0,
    resellerMarkupPercent: 15,
    minimumProfitPer1000: 0.5,
  },
  notifications: {
    emailEnabled: false,
    orderNotifications: true,
    depositNotifications: true,
  },
  affiliates: {
    enabled: true,
    commissionPercent: 7,
    minimumPayout: 10,
    lifetime: true,
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
    return { ...(fallback as Record<string, unknown>), ...(stored as Record<string, unknown>) };
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
    channels: (channels.items ?? []).filter((item) => item?.name && item?.url),
    affiliates: all.affiliates,
  };
}

export async function updateSettings(key: string, value: unknown, actor: AuthUser, ip?: string) {
  await query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(value), actor.id]
  );
  await writeAudit({ actor, action: "settings.update", targetType: "settings", targetId: key, details: value, ip });
  return getSettings();
}
