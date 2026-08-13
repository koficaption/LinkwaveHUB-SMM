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
