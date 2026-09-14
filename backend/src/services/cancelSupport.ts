const CANCEL_YES = /cancel\s*(anytime|any\s*time|button|available|supported)|cancellable/i;
const CANCEL_NO = /no\s*cancel|non[\s-]*cancellable|cannot\s*cancel|can'?t\s*cancel/i;

export function productSupportsCancel(product?: {
  cancel_supported?: unknown;
  name?: unknown;
  description?: unknown;
  product_name?: unknown;
  product_features?: unknown;
  features?: unknown;
} | null) {
  if (!product) return false;
  if (product.cancel_supported === true) return true;
  const features = Array.isArray(product.features)
    ? product.features
    : Array.isArray(product.product_features)
      ? product.product_features
      : [];
  const text = [product.name, product.product_name, product.description, ...features]
    .filter(Boolean)
    .join(" ");
  if (CANCEL_NO.test(text) && !CANCEL_YES.test(text)) return false;
  return CANCEL_YES.test(text);
}

export function remainingQuantity(order: {
  quantity?: unknown;
  remains?: unknown;
  status?: unknown;
  provider_order_id?: unknown;
}) {
  const quantity = Math.max(0, Number(order.quantity) || 0);
  const remains = order.remains == null || order.remains === "" ? null : Number(order.remains);
  const status = String(order.status || "");
  if (Number.isFinite(remains) && remains != null) {
    return Math.min(quantity, Math.max(0, remains));
  }
  if (status === "pending" || !order.provider_order_id) return quantity;
  if (["completed", "partial"].includes(status)) return 0;
  return quantity;
}

export function remainingRefund(
  charge: number,
  quantity: number,
  remains: number,
  alreadyRefunded = 0
) {
  if (!(charge > 0) || !(quantity > 0)) return 0;
  const portion = Math.min(1, Math.max(0, remains / quantity));
  const raw = Number((charge * portion).toFixed(4));
  const left = Number(Math.max(0, charge - alreadyRefunded).toFixed(4));
  return Math.min(left, raw);
}

export type CancelSummary = {
  supported: boolean;
  eligible: boolean;
  remains: number;
  quantity: number;
  delivered: number;
  refundAmount: number;
  reason?: string;
};

export function summarizeCancel(order: Record<string, unknown>): CancelSummary {
  const quantity = Math.max(0, Number(order.quantity) || 0);
  const remains = remainingQuantity(order);
  const charge = Number(order.charge) || 0;
  const already = Number(order.refunded_amount) || 0;
  const refundAmount = remainingRefund(charge, quantity, remains, already);
  const supported = productSupportsCancel(order);
  const status = String(order.status || "");
  const closed = ["cancelled", "refunded", "failed"].includes(status);
  let reason: string | undefined;
  let eligible = false;
  if (!supported) reason = "This service cannot be cancelled.";
  else if (closed) reason = "This order is already closed.";
  else if (remains <= 0) reason = "Nothing is left to cancel.";
  else if (refundAmount <= 0) reason = "This order was already refunded.";
  else eligible = true;
  return {
    supported,
    eligible,
    remains,
    quantity,
    delivered: Math.max(0, quantity - remains),
    refundAmount,
    reason,
  };
}
