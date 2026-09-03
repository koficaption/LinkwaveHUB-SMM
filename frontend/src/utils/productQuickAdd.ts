import type { Product } from "@/types";

export type ServiceType = "api" | "manual" | "digital_product" | "subscription" | "account" | "other";

export const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: "manual", label: "Manual Service" },
  { value: "api", label: "API Service" },
  { value: "digital_product", label: "Digital Product" },
  { value: "subscription", label: "Subscription" },
  { value: "account", label: "Account" },
  { value: "other", label: "Other" },
];

const LAST_USED_KEY = "lbg.admin.quickAdd";

export type LastUsed = {
  platformId?: string;
  categoryId?: string;
  serviceType?: ServiceType;
  providerId?: string;
  categoryByPlatform?: Record<string, string>;
};

export function readLastUsed(): LastUsed {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    return raw ? JSON.parse(raw) as LastUsed : {};
  } catch {
    return {};
  }
}

export function writeLastUsed(next: LastUsed) {
  const prev = readLastUsed();
  const categoryByPlatform = { ...(prev.categoryByPlatform || {}) };
  if (next.platformId && next.categoryId) categoryByPlatform[next.platformId] = next.categoryId;
  localStorage.setItem(LAST_USED_KEY, JSON.stringify({ ...prev, ...next, categoryByPlatform }));
}

export function lastCategoryForPlatform(platformId: string) {
  const used = readLastUsed();
  if (used.platformId === platformId && used.categoryId) return used.categoryId;
  return used.categoryByPlatform?.[platformId] || "";
}

export function inferServiceType(product: Product | null): ServiceType {
  if (!product) return "manual";
  const current = product.service_type;
  if (current && SERVICE_TYPE_OPTIONS.some((option) => option.value === current)) return current;
  if (/netflix|subscription/i.test(product.name)) return "subscription";
  if (/\baccount\b/i.test(product.name) && (product.contact_admin || !product.provider_id)) return "account";
  if (!product.provider_id || product.contact_admin) return "manual";
  return "api";
}

export function isPerUnitType(type: ServiceType) {
  return type === "digital_product" || type === "subscription" || type === "account";
}

export function round4(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(4));
}

export function sellFromCost(cost: number, percent: number) {
  return round4(cost * (1 + percent / 100));
}

export function percentFromPrices(cost: number, sell: number) {
  if (!cost) return 0;
  return round4(((sell - cost) / cost) * 100);
}

export function serviceNoLabel(product: { service_no?: number | string | null; id?: string }) {
  if (product.service_no != null && product.service_no !== "") return `#${product.service_no}`;
  return product.id ? `#${String(product.id).slice(0, 8)}` : "";
}
