const CANCEL_YES = /cancel\s*(anytime|any\s*time|button|available|supported)|cancellable/i;
const CANCEL_NO = /no\s*cancel|non[\s-]*cancellable|cannot\s*cancel|can'?t\s*cancel/i;

export function productCancel(product?: {
  name?: string | null;
  description?: string | null;
  features?: string[] | null;
} | null) {
  if (!product) return { supported: false };
  const text = [product.name, product.description, ...(product.features || [])].filter(Boolean).join(" ");
  if (CANCEL_NO.test(text) && !CANCEL_YES.test(text)) return { supported: false };
  return { supported: CANCEL_YES.test(text) };
}
