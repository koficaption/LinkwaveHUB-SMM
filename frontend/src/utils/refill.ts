const NO_REFILL = /no\s*refill|non[\s-]*refill|without\s*refill|refill\s*[:\-]?\s*no\b/i;
const REFILL_WORD = /\brefill\b/i;
const LIFETIME = /lifetime\s*(auto)?\s*refill|refill\s*[:\-]?\s*lifetime|auto\s*refill/i;
const DAYS_PATTERNS = [
  /refill\s*[:\-]?\s*(\d+)\s*(?:days?|d\b)/i,
  /(\d+)\s*(?:days?|d)\s*refill/i,
  /refill\s*[:\-]?\s*(\d+)/i,
];

export function parseRefillHint(name?: string | null, extra = "", panelRefill = false) {
  const text = `${name || ""} ${extra}`.trim();
  if (NO_REFILL.test(text)) {
    return { supported: panelRefill, days: 30 };
  }
  let days: number | null = null;
  for (const pattern of DAYS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      days = Math.min(365, Math.max(1, Number(match[1]) || 30));
      break;
    }
  }
  const lifetime = LIFETIME.test(text);
  const mentions = REFILL_WORD.test(text);
  return {
    supported: panelRefill || mentions || lifetime,
    days: days ?? (lifetime ? 365 : 30),
  };
}

export function productRefill(product: { name?: string; refill_supported?: boolean; refill_days?: number }) {
  if (product.refill_supported) {
    return { supported: true, days: Number(product.refill_days || 30) };
  }
  return parseRefillHint(product.name);
}
