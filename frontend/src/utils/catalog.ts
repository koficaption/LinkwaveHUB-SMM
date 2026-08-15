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
