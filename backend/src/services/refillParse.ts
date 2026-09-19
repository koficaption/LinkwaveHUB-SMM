const NO_REFILL = /no\s*refill|non[\s-]*refill|without\s*refill|refill\s*[:\-]?\s*no\b/i;
const REFILL_WORD = /\brefill\b/i;
const LIFETIME = /lifetime\s*(auto)?\s*refill|refill\s*[:\-]?\s*lifetime|auto\s*refill/i;
const DAYS_PATTERNS = [
  /refill\s*[:\-]?\s*(\d+)\s*(?:days?|d\b)/i,
  /(\d+)\s*(?:days?|d)\s*refill/i,
  /refill\s*[:\-]?\s*(\d+)/i,
];

export type RefillHint = {
  supported: boolean;
  days: number;
  fromName: boolean;
};

export function parsePanelFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") return /^(1|true|yes|y)$/i.test(value.trim());
  return false;
}

export function parseRefillHint(name: string, extra = "", panelRefill = false): RefillHint {
  const text = `${name} ${extra}`.trim();
  if (NO_REFILL.test(text)) {
    return { supported: panelRefill, days: 30, fromName: false };
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
  const supported = panelRefill || mentions || lifetime;
  return {
    supported,
    days: days ?? (lifetime ? 365 : 30),
    fromName: mentions || lifetime || days != null,
  };
}
