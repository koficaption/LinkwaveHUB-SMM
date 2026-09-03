import { toast } from "sonner";
import { api, formatDate, ApiError } from "@/api/client";
import type { Order } from "@/types";
import { publicProductName } from "@/utils/catalog";
import { Button, Modal } from "@/components/ui";

export function RequestRefillDialog({
  order,
  admin,
  open,
  pending,
  onClose,
  onConfirm,
}: {
  order: Order;
  admin?: boolean;
  open: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const refill = order.refill;
  return (
    <Modal open={open} title={`Request refill for ${order.public_id}?`} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Are you sure you want to request a refill for Order {order.public_id}?
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Service</dt><dd className="font-medium">{publicProductName(order.product_name)}</dd></div>
        <div><dt className="text-slate-500">Target</dt><dd className="break-all font-medium">{order.target}</dd></div>
        <div><dt className="text-slate-500">Original quantity</dt><dd className="font-medium">{order.quantity.toLocaleString()}</dd></div>
        <div><dt className="text-slate-500">Refill period</dt><dd className="font-medium">{refill?.refillDays ?? 30} days</dd></div>
        <div><dt className="text-slate-500">Provider</dt><dd className="font-medium">{order.provider_name || "—"}</dd></div>
        <div>
          <dt className="text-slate-500">Deadline</dt>
          <dd className="font-medium">{refill?.expiresAt ? formatDate(refill.expiresAt) : "—"}</dd>
        </div>
      </dl>
      {admin && refill && !refill.providerRefillSupported && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          Provider does not support automatic refill. Confirming will create a refill record marked for manual handling.
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={pending} onClick={onConfirm}>{pending ? "Requesting…" : "Confirm refill"}</Button>
      </div>
    </Modal>
  );
}

export async function submitRefill(order: Order, admin?: boolean) {
  const path = admin ? `/admin/orders/${order.id}/refill` : `/orders/${order.id}/refill`;
  try {
    await api(path, { method: "POST" });
    toast.success("Refill requested");
    return true;
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Could not request refill");
    return false;
  }
}
