const PROVIDER_NOISE = /resellers?mm|\bprovider\b|task\s*\/\s*farm|smm\s*panel/i;

export function publicCategoryName(name?: string | null) {
  const value = String(name || "").trim();
  if (!value) return "Other";
  if (PROVIDER_NOISE.test(value)) return "Other";
  return value
    .replace(/resellers?mm/gi, "")
    .replace(/\bprovider\b/gi, "")
    .replace(/\[[^\]]*(task|farm)[^\]]*\]/gi, "")
    .replace(/imported from .+/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "Other";
}

export function isProviderCategory(name?: string | null) {
  return PROVIDER_NOISE.test(String(name || ""));
}

export function isEachPrice(product?: {
  price_unit?: string;
  name?: string;
  min_quantity?: number;
  max_quantity?: number;
  contact_admin?: boolean;
  service_type?: string;
} | null) {
  if (!product) return false;
  if (product.price_unit === "each") return true;
  const type = product.service_type;
  if (type === "account" || type === "digital_product") return true;
  if (product.contact_admin) return true;
  return /netflix/i.test(product.name || "");
}

export function orderTotal(unit: number, quantity: number, priceUnit?: string) {
  if (priceUnit === "each") return unit * quantity;
  return (unit * quantity) / 1000;
}

export function priceUnitSuffix(product?: { price_unit?: string; name?: string; min_quantity?: number; max_quantity?: number } | null) {
  return isEachPrice(product) ? "per 1" : "/ 1,000";
}

export function publicProductDescription(description?: string | null) {
  if (!description) return null;
  const text = description.replace(/\s*·?\s*imported from .+$/i, "").trim();
  if (!text || PROVIDER_NOISE.test(text)) return null;
  return text;
}

/** Strip provider decorative wrappers (dashed lines, arrows, tildes) from service titles. */
export function publicProductName(name?: string | null) {
  const original = String(name ?? "").trim();
  if (!original) return "";
  let cleaned = original
    .replace(/[↓↑➤►◀▶★☆✦✧✔✅✨🔹◄▼▲➔➜➡⬅⬆⬇⇨⇦⇧⇩]+/g, " ")
    .replace(/[-_=~•·~—–−]{3,}/g, " ")
    .replace(/[~]{2,}/g, " ")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || original;
}

export function isSellableProductName(name?: string | null) {
  return /[A-Za-z]{3,}/.test(publicProductName(name));
}
