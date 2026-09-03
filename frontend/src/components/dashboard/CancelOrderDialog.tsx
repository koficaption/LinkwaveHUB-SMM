import { api, money, ApiError } from "@/api/client";
import type { Order } from "@/types";
import { publicProductName } from "@/utils/catalog";
import { Button, Modal } from "@/components/ui";

export function CancelOrderDialog({
  order,
  pending,
  onClose,
  onConfirm,
}: {
  order: Order;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancel = order.cancel;
  const remains = cancel?.remains ?? order.remains ?? order.quantity;
  const delivered = cancel?.delivered ?? Math.max(0, order.quantity - Number(remains ?? 0));
  const refund = cancel?.refundAmount ?? 0;
  return (
    <Modal open title={`Cancel ${order.public_id}?`} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Quantity already delivered stays. The leftover is cancelled and refunded to your wallet.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Service</dt><dd className="font-medium">{publicProductName(order.product_name)}</dd></div>
        <div><dt className="text-slate-500">Ordered</dt><dd className="font-medium">{order.quantity.toLocaleString()}</dd></div>
        <div><dt className="text-slate-500">Delivered</dt><dd className="font-medium">{delivered.toLocaleString()}</dd></div>
        <div><dt className="text-slate-500">Remaining</dt><dd className="font-medium">{Number(remains || 0).toLocaleString()}</dd></div>
        <div><dt className="text-slate-500">Paid</dt><dd className="font-medium">{money(order.charge)}</dd></div>
        <div><dt className="text-slate-500">Refund now</dt><dd className="font-medium text-brand-700">{money(refund)}</dd></div>
      </dl>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>Keep order</Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>{pending ? "Cancelling…" : "Cancel and refund"}</Button>
      </div>
    </Modal>
  );
}

export async function submitCancel(order: Order) {
  return api<Order>(`/orders/${order.public_id || order.id}/cancel`, { method: "POST" });
}

export function cancelErrorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Could not cancel this order";
}
