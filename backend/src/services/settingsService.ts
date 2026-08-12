import { query, queryOne } from "../db.js";
import { writeAudit } from "./auditService.js";
import type { AuthUser } from "../middleware/auth.js";

const defaults: Record<string, unknown> = {
  general: {
    siteName: "LinkWaveHub SMM",
    tagline: "Grow Your Social Presence With Powerful Social Media Services",
    supportEmail: "support@linkwavehub.com",
    contactPhone: "+233 00 000 0000",
    address: "Accra, Ghana",
    developer: "OB CodeLab",
    currency: "GHS",
    logoUrl: "",
    faviconUrl: "",
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

export async function getSettings() {
  const rows = await query<{ key: string; value: unknown }>(`SELECT key, value FROM settings`);
  const map: Record<string, unknown> = { ...defaults };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function getPublicSettings() {
  const all = await getSettings();
  const general = all.general as Record<string, unknown>;
  return {
    siteName: general.siteName,
    tagline: general.tagline,
    supportEmail: general.supportEmail,
    contactPhone: general.contactPhone,
    developer: general.developer,
    currency: general.currency,
    logoUrl: general.logoUrl,
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
