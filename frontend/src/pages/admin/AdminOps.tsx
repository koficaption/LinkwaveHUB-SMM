import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, formatDate, money, ApiError } from "@/api/client";
import type { Order, Paginated, PaymentMethod, Platform, RefillRecord, User } from "@/types";
import { Badge, Button, Card, Input, Modal, Pagination, PasswordInput, Select, Textarea } from "@/components/ui";
import { OrderSelect, SearchField } from "@/components/dashboard/OrderSelect";
import { prettyStatus, statusTone, formatCount } from "@/utils/cn";
import { RefillBadge } from "@/components/dashboard/RefillBadge";
import { RequestRefillDialog, submitRefill } from "@/components/dashboard/RequestRefillDialog";
import { KORAPAY_MARKETS } from "@/utils/korapayMarkets";

function isCardMethod(adapter?: string | null) {
  return adapter === "korapay" || adapter === "paystack" || adapter === "card";
}

export function AdminOrders() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState(params.get("q") || "");
  const [platformId, setPlatformId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [refill, setRefill] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [active, setActive] = useState<Order | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms?all=1") });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api<{ id: string; name: string }[]>("/admin/providers") });
  const orders = useQuery({
    queryKey: ["admin-orders", page, status, search, platformId, providerId, refill, from, to],
    queryFn: () => api<Paginated<Order>>(`/admin/orders?page=${page}&status=${status}&search=${encodeURIComponent(search)}&platformId=${platformId}&providerId=${providerId}&refill=${refill}&from=${from}&to=${to}`),
    refetchInterval: 20_000,
  });
  const items = orders.data?.items ?? [];
  const selectedOrders = items.filter((o) => selected.includes(o.id));
  const eligible = selectedOrders.filter((o) => o.refill?.eligible);

  const bulkRefill = useMutation({
    mutationFn: () => api<{ eligible: number; skipped: number }>("/admin/orders/bulk-refill", {
      method: "POST",
      body: JSON.stringify({ ids: eligible.map((o) => o.id) }),
    }),
    onSuccess: (data) => {
      toast.success(`Refill requested for ${data.eligible} order${data.eligible === 1 ? "" : "s"}`);
      setBulkOpen(false);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Bulk refill failed"),
  });

  function exportSelected() {
    const rows = selectedOrders.length ? selectedOrders : items;
    const header = ["Order ID","Customer","Service","Target","Quantity","Start","Remains","Charge","Status","Refill","Created"];
    const csv = [header.join(","), ...rows.map((o) => [
      o.public_id, o.customer_email, JSON.stringify(o.product_name), JSON.stringify(o.target),
      o.quantity, o.start_count ?? "", o.remains ?? "", o.charge, o.status, o.refill?.display ?? "", o.created_at,
    ].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Orders</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SearchField placeholder="Search ID, email, target" value={search} onChange={setSearch} />
        <OrderSelect
          label="Status"
          value={status}
          onChange={setStatus}
          placeholder="All statuses"
          options={["pending","processing","in_progress","completed","partial","cancelled","refunded","failed"].map((s) => ({ value: s, label: prettyStatus(s) }))}
        />
        <OrderSelect
          label="Category"
          value={platformId}
          onChange={setPlatformId}
          placeholder="All categories"
          leadingCheck
          options={(platforms.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <OrderSelect
          label="Provider"
          value={providerId}
          onChange={setProviderId}
          placeholder="All providers"
          options={(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <OrderSelect
          label="Refill"
          value={refill}
          onChange={setRefill}
          placeholder="All"
          options={[
            { value: "available", label: "Available" },
            { value: "supported", label: "Supported" },
            { value: "unsupported", label: "Not supported" },
            { value: "requested", label: "Requested" },
            { value: "processing", label: "Processing" },
            { value: "failed", label: "Failed" },
            { value: "expired", label: "Expired" },
          ]}
        />
        <label className="block">
          <span className="label">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportSelected}>Export selected</Button>
          <Button onClick={() => setBulkOpen(true)}>Request refill where eligible</Button>
        </div>
      )}
      <div className="mt-4 space-y-3 lg:hidden">
        {items.map((o) => (
          <Card key={o.id}>
            <p className="font-mono text-xs text-muted">{o.public_id}</p>
            <h3 className="mt-1 font-bold">{o.product_name}</h3>
            <p className="mt-2 text-sm text-muted">Customer: {o.customer_name}</p>
            <p className="text-sm text-muted">Quantity: {o.quantity.toLocaleString()} · {money(o.charge)}</p>
            <p className="text-sm text-muted">Start count: {formatCount(o.start_count)} · Remaining: {formatCount(o.remains)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className={statusTone[o.status]}>{prettyStatus(o.status)}</Badge>
              <RefillBadge supported={o.refill?.refillSupported} days={o.refill?.refillDays} display={o.refill?.display} />
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setActive(o)}>View order</Button>
          </Card>
        ))}
      </div>
      <Card className="mt-4 hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="p-2"><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? items.map((o) => o.id) : [])} /></th>
              {["Order ID","Customer","Service","Target","Qty","Start","Remains","Charge","Provider","Status","Refill","Created","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2"><input type="checkbox" checked={selected.includes(o.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, o.id] : s.filter((id) => id !== o.id))} /></td>
                <td className="p-2 font-semibold">{o.public_id}</td>
                <td className="p-2">{o.customer_name}<div className="text-xs text-slate-500">{o.customer_email}</div></td>
                <td className="p-2">{o.product_name}</td>
                <td className="p-2 max-w-[140px] truncate" title={o.target}>{o.target}</td>
                <td className="p-2">{o.quantity.toLocaleString()}</td>
                <td className="p-2">{formatCount(o.start_count)}</td>
                <td className="p-2">{formatCount(o.remains)}</td>
                <td className="p-2">{money(o.charge)}</td>
                <td className="p-2">{o.provider_name || "—"}</td>
                <td className="p-2"><Badge className={statusTone[o.status]}>{prettyStatus(o.status)}</Badge></td>
                <td className="p-2"><RefillBadge supported={o.refill?.refillSupported} days={o.refill?.refillDays} display={o.refill?.display} /></td>
                <td className="p-2 text-slate-500">{formatDate(o.created_at)}</td>
                <td className="p-2"><button className="font-semibold text-brand-700" onClick={() => setActive(o)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.data && <Pagination page={page} total={orders.data.total} limit={orders.data.limit} onPage={setPage} />}
      </Card>
      {active && <OrderDrawer order={active} onClose={() => setActive(null)} onChanged={() => { setActive(null); qc.invalidateQueries({ queryKey: ["admin-orders"] }); }} />}
      {bulkOpen && (
        <Modal open title="Bulk refill" onClose={() => setBulkOpen(false)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {eligible.length} of {selected.length} selected orders are eligible for refill.
          </p>
          <p className="mt-2 text-xs text-slate-500">Orders that do not support refill, have expired, or already have a refill in progress will be skipped.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button disabled={!eligible.length || bulkRefill.isPending} onClick={() => bulkRefill.mutate()}>
              Continue
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OrderDrawer({ order, onClose, onChanged }: { order: Order; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState(order.status);
  const [note, setNote] = useState(order.admin_note ?? "");
  const [confirm, setConfirm] = useState(false);
  const detail = useQuery({
    queryKey: ["order", order.id],
    queryFn: () => api<Order>(`/orders/${order.id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.status ?? order.status;
      return ["pending", "processing", "in_progress", "partial"].includes(s) ? 15_000 : false;
    },
  });
  const refills = useQuery({
    queryKey: ["order-refills", order.id],
    queryFn: () => api<{ items: RefillRecord[] }>(`/orders/${order.id}/refills`),
  });
  const o = detail.data ?? order;
  const refill = o.refill;
  const act = async (path: string, body?: unknown) => {
    try {
      await api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      toast.success("Order updated");
      onChanged();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Failed"); }
  };
  return (
    <Modal open title={order.public_id} onClose={onClose}>
      <p className="text-sm text-slate-500">{o.product_name} · {o.customer_email}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Customer</dt><dd className="font-medium">{o.customer_name}</dd></div>
        <div><dt className="text-slate-500">Platform</dt><dd className="font-medium">{o.platform_name}</dd></div>
        <div><dt className="text-slate-500">Quantity</dt><dd className="font-medium">{o.quantity.toLocaleString()}</dd></div>
        <div><dt className="text-slate-500">Start count</dt><dd className="font-medium">{formatCount(o.start_count)}</dd></div>
        <div><dt className="text-slate-500">Remaining</dt><dd className="font-medium">{formatCount(o.remains)}</dd></div>
        <div><dt className="text-slate-500">Charge</dt><dd className="font-medium">{money(o.charge)}</dd></div>
        {o.profit != null && <div><dt className="text-slate-500">Profit</dt><dd className="font-medium">{money(o.profit)}</dd></div>}
        <div className="sm:col-span-2"><dt className="text-slate-500">Target</dt><dd className="break-all font-medium">{o.target}</dd></div>
        <div><dt className="text-slate-500">Provider</dt><dd className="font-medium">{o.provider_name || "—"}</dd></div>
        <div><dt className="text-slate-500">Provider order</dt><dd className="font-mono text-xs">{o.provider_order_id || "—"}</dd></div>
        {o.admin_note ? <div className="sm:col-span-2"><dt className="text-slate-500">Provider note</dt><dd className="break-words font-medium text-rose-600">{o.admin_note}</dd></div> : null}
        <div><dt className="text-slate-500">Created</dt><dd className="font-medium">{formatDate(o.created_at)}</dd></div>
        <div><dt className="text-slate-500">Updated</dt><dd className="font-medium">{formatDate(o.updated_at)}</dd></div>
      </dl>
      <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="font-semibold">Refill information</h3>
        <div className="mt-2"><RefillBadge supported={refill?.refillSupported} days={refill?.refillDays} display={refill?.display} /></div>
        {refill?.refillSupported ? (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Period</dt><dd>{refill.refillDays} days</dd></div>
            <div><dt className="text-slate-500">Deadline</dt><dd>{formatDate(refill.expiresAt)}</dd></div>
            <div><dt className="text-slate-500">Used</dt><dd>{refill.used} / {refill.maxRefills}</dd></div>
            <div><dt className="text-slate-500">Provider API</dt><dd>{refill.providerRefillSupported ? "Yes" : "Manual refill required"}</dd></div>
          </dl>
        ) : <p className="mt-2 text-sm text-slate-500">This service does not support refill.</p>}
        {refill?.eligible && <Button className="mt-3" onClick={() => setConfirm(true)}>↻ Request refill</Button>}
        {!refills.data?.items.length && <p className="mt-3 text-sm text-slate-500">No refill requests yet.</p>}
        {!!refills.data?.items.length && (
          <table className="mt-3 w-full text-left text-xs">
            <thead><tr className="text-slate-500">{["ID","Status","Provider","Requested"].map((h) => <th key={h} className="pb-1">{h}</th>)}</tr></thead>
            <tbody>
              {refills.data.items.map((r) => (
                <tr key={r.id}>
                  <td className="py-1 font-mono">{r.public_id}</td>
                  <td>{prettyStatus(r.status)}</td>
                  <td>{r.provider_refill_id || "—"}</td>
                  <td>{formatDate(r.requested_at || r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4 space-y-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["pending","processing","in_progress","completed","partial","cancelled","refunded","failed"].map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </Select>
        <Textarea placeholder="Admin note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => { await api(`/admin/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status, note }) }); toast.success("Status saved"); onChanged(); }}>Change status</Button>
          <Button variant="outline" onClick={() => act(`/admin/orders/${order.id}/retry`)}>Send to provider</Button>
          <Button variant="outline" onClick={() => act(`/admin/orders/${order.id}/sync`)}>Refresh status</Button>
          <Button variant="danger" onClick={() => act(`/admin/orders/${order.id}/refund`, { note })}>Refund</Button>
        </div>
      </div>
      {confirm && (
        <RequestRefillDialog
          order={o}
          admin
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            const ok = await submitRefill(o, true);
            if (ok) { setConfirm(false); onChanged(); }
          }}
        />
      )}
    </Modal>
  );
}

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const users = useQuery({
    queryKey: ["admin-users", search, role],
    queryFn: () => api<Paginated<User>>(`/admin/users?search=${encodeURIComponent(search)}&role=${role}`),
  });
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Users</h1>
        <Button onClick={() => setOpen(true)}>Create user</Button>
      </div>
      <div className="mt-4 flex gap-3">
        <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="max-w-40">
          <option value="">All roles</option>
          <option value="customer">Customer</option>
          <option value="reseller">Reseller</option>
          <option value="admin">Admin</option>
        </Select>
      </div>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Name","Email","Code","Role","Status",""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {users.data?.items.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{u.full_name}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2 font-mono text-xs font-semibold">{u.deposit_code || "—"}</td>
                <td className="p-2 capitalize">{u.role}</td>
                <td className="p-2"><Badge className={statusTone[u.status]}>{u.status}</Badge></td>
                <td className="p-2"><Link className="font-semibold text-brand-700" to={`/admin/users/${u.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {open && <CreateUserModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ fullName: "", email: "", password: "ChangeMe123", role: "customer", phone: "" });
  return (
    <Modal open title="Create user" onClose={onClose}>
      <div className="space-y-3">
        <Input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="customer">Customer</option>
          <option value="reseller">Reseller</option>
          <option value="admin">Admin</option>
        </Select>
        <Button onClick={async () => {
          try {
            await api("/admin/users", { method: "POST", body: JSON.stringify(form) });
            toast.success("User created");
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            onClose();
          } catch (e) { toast.error(e instanceof ApiError ? e.message : "Failed"); }
        }}>Create</Button>
      </div>
    </Modal>
  );
}

export function AdminUserDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["user", id],
    queryFn: () => api<{ user: User; wallet: Record<string, unknown>; orders: Record<string, unknown>[]; transactions: Record<string, unknown>[]; stats: Record<string, unknown> }>(`/admin/users/${id}`),
  });
  const u = detail.data?.user;
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("Admin adjustment");
  if (!u) return null;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">{u.full_name}</h1>
            <p className="text-slate-500">{u.email} · {u.role}</p>
            {u.deposit_code && (
              <p className="mt-1 text-sm">Payment code: <span className="font-mono font-bold">{u.deposit_code}</span></p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={async () => { await api(`/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ status: u.status === "suspended" ? "active" : "suspended" }) }); qc.invalidateQueries({ queryKey: ["user", id] }); }}>{u.status === "suspended" ? "Activate" : "Suspend"}</Button>
            <Button variant="outline" onClick={async () => { const password = prompt("New password (min 8 characters)"); if (!password) return; await api(`/admin/users/${u.id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }); toast.success("Password reset"); }}>Reset password</Button>
          </div>
        </div>
        <p className="mt-3 text-sm">Wallet: {money(Number(detail.data?.wallet?.balance ?? 0))} · Orders: {String(detail.data?.stats?.order_count ?? 0)} · Spent: {money(Number(detail.data?.stats?.total_spent ?? 0))}</p>
      </Card>
      <Card>
        <h2 className="font-bold">Wallet adjustment</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-32" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button onClick={async () => { await api(`/admin/users/${u.id}/wallet`, { method: "POST", body: JSON.stringify({ amount: Number(amount), reason }) }); toast.success("Wallet updated"); qc.invalidateQueries({ queryKey: ["user", id] }); }}>Apply</Button>
        </div>
      </Card>
    </div>
  );
}

export function AdminResellers() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["resellers"], queryFn: () => api<Record<string, unknown>[]>("/admin/resellers") });
  const applications = useQuery({ queryKey: ["reseller-applications"], queryFn: () => api<Record<string, unknown>[]>("/admin/reseller-applications") });
  const pendingApps = applications.data?.filter((a) => String(a.status) === "pending_review" || String(a.status) === "pending_payment") ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Resellers</h1>
      <Card className="overflow-x-auto">
        <h2 className="font-bold">Upgrade applications</h2>
        <p className="mt-1 text-sm text-slate-500">Customers who paid the reseller upgrade fee. Confirm matching Mobile Money payments. Korapay upgrades complete automatically — no admin approval.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Customer","Store","Fee","MoMo","Payment","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {(applications.data ?? []).map((a) => (
              <tr key={String(a.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(a.full_name)}<div className="text-xs text-slate-500">{String(a.email)}</div></td>
                <td className="p-2">{String(a.store_name)}</td>
                <td className="p-2">{money(Number(a.fee_amount))}</td>
                <td className="p-2 text-xs">{[a.sender_name, a.sender_number].filter(Boolean).map(String).join(" · ") || "—"}</td>
                <td className="p-2 font-mono text-xs font-semibold">{String(a.deposit_code || a.payment_reference || "—")}<div className="font-sans text-slate-500">{prettyStatus(String(a.payment_status || a.method_name || ""))}</div></td>
                <td className="p-2"><Badge className={statusTone[String(a.status)]}>{prettyStatus(String(a.status))}</Badge></td>
                <td className="p-2 space-x-2">
                  {(String(a.status) === "pending_review" || String(a.status) === "pending_payment") && (
                    isCardMethod(String(a.adapter || a.method_code || "")) ? (
                      <>
                        <span className="text-xs font-semibold text-slate-500">Automatic — no admin confirm</span>
                        {a.payment_reference ? (
                          <button className="font-semibold text-brand-700" onClick={async () => {
                            try {
                              await api(`/admin/payments/${encodeURIComponent(String(a.payment_reference))}/confirm`, { method: "POST" });
                              toast.success("Korapay confirmed. Promoted to reseller");
                              qc.invalidateQueries({ queryKey: ["reseller-applications"] });
                              qc.invalidateQueries({ queryKey: ["resellers"] });
                              qc.invalidateQueries({ queryKey: ["admin-payments"] });
                            } catch (e) {
                              toast.error(e instanceof ApiError ? e.message : "Korapay has not confirmed this payment yet");
                            }
                          }}>Check Korapay</button>
                        ) : null}
                        <button className="font-semibold text-rose-600" onClick={async () => {
                          await api(`/admin/reseller-applications/${a.id}/reject`, { method: "POST", body: JSON.stringify({}) });
                          toast.success("Application rejected");
                          qc.invalidateQueries({ queryKey: ["reseller-applications"] });
                          qc.invalidateQueries({ queryKey: ["admin-payments"] });
                        }}>Reject</button>
                      </>
                    ) : (
                    <>
                      <button className="font-semibold text-brand-700" onClick={async () => {
                        await api(`/admin/reseller-applications/${a.id}/approve`, { method: "POST" });
                        toast.success("Promoted to reseller");
                        qc.invalidateQueries({ queryKey: ["reseller-applications"] });
                        qc.invalidateQueries({ queryKey: ["resellers"] });
                        qc.invalidateQueries({ queryKey: ["admin-payments"] });
                      }}>Confirm & promote</button>
                      <button className="font-semibold text-rose-600" onClick={async () => {
                        await api(`/admin/reseller-applications/${a.id}/reject`, { method: "POST", body: JSON.stringify({}) });
                        toast.success("Application rejected");
                        qc.invalidateQueries({ queryKey: ["reseller-applications"] });
                        qc.invalidateQueries({ queryKey: ["admin-payments"] });
                      }}>Reject</button>
                    </>
                    )
                  )}
                </td>
              </tr>
            ))}
            {!applications.data?.length && (
              <tr><td className="p-2 text-slate-500" colSpan={7}>{pendingApps.length ? "" : "No upgrade applications yet."}</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto">
        <h2 className="font-bold">Reseller accounts</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Store","Owner","Status","Orders","Profit","Available","Wallet","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {list.data?.map((r) => (
              <tr key={String(r.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(r.store_name)}<div className="text-xs text-slate-500">/store/{String(r.store_slug)}</div></td>
                <td className="p-2">{String(r.full_name)}</td>
                <td className="p-2"><Badge className={statusTone[String(r.status)]}>{String(r.status)}</Badge></td>
                <td className="p-2">{String(r.order_count)}</td>
                <td className="p-2">{money(Number(r.total_profit))}</td>
                <td className="p-2">{money(Number(r.profit_balance))}</td>
                <td className="p-2">{money(Number(r.wallet_balance))}</td>
                <td className="p-2 space-x-2">
                  {["active","suspended"].map((s) => (
                    <button key={s} className="font-semibold text-brand-700" onClick={async () => { await api(`/admin/resellers/${r.id}/status`, { method: "POST", body: JSON.stringify({ status: s }) }); toast.success("Updated"); qc.invalidateQueries({ queryKey: ["resellers"] }); }}>{prettyStatus(s)}</button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AdminResellerPayouts() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const list = useQuery({
    queryKey: ["admin-reseller-withdrawals", status],
    queryFn: () => api<Record<string, unknown>[]>(`/admin/reseller-withdrawals${status ? `?status=${status}` : ""}`),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Reseller payouts</h1>
      <p className="text-sm text-slate-500">MoMo withdrawals wait for you to send the money. Dashboard-wallet transfers are automatic.</p>
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
        <option value="rejected">Rejected</option>
      </Select>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">{["Reseller", "Amount", "To", "MoMo", "Status", "Requested", "Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((w) => (
              <tr key={String(w.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(w.store_name)}<div className="text-xs text-slate-500">{String(w.full_name)} · {String(w.email)}</div></td>
                <td className="p-2 whitespace-nowrap">{money(Number(w.amount))}</td>
                <td className="p-2 capitalize">{String(w.destination)}</td>
                <td className="p-2 text-xs">{[w.momo_network, w.momo_number, w.momo_name].filter(Boolean).map(String).join(" · ") || "—"}</td>
                <td className="p-2"><Badge className={statusTone[String(w.status)]}>{prettyStatus(String(w.status))}</Badge></td>
                <td className="p-2 whitespace-nowrap">{formatDate(String(w.created_at))}</td>
                <td className="p-2 space-x-2">
                  {String(w.status) === "pending" && String(w.destination) === "momo" && (
                    <>
                      <button className="font-semibold text-brand-700" onClick={async () => {
                        await api(`/admin/reseller-withdrawals/${w.id}/review`, { method: "POST", body: JSON.stringify({ status: "paid" }) });
                        toast.success("Marked as paid");
                        qc.invalidateQueries({ queryKey: ["admin-reseller-withdrawals"] });
                      }}>Mark paid</button>
                      <button className="font-semibold text-rose-600" onClick={async () => {
                        await api(`/admin/reseller-withdrawals/${w.id}/review`, { method: "POST", body: JSON.stringify({ status: "rejected" }) });
                        toast.success("Returned to profit balance");
                        qc.invalidateQueries({ queryKey: ["admin-reseller-withdrawals"] });
                      }}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!list.data?.length && (
              <tr><td className="p-2 text-slate-500" colSpan={7}>No payouts yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AdminPayments() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const payments = useQuery({
    queryKey: ["admin-payments", search, status],
    queryFn: () => api<Paginated<Record<string, unknown>>>(`/admin/payments?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`),
  });
  const methods = useQuery({ queryKey: ["admin-methods"], queryFn: () => api<PaymentMethod[]>("/admin/payments/methods") });
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Payments</h1>
          <p className="text-sm text-slate-500">Add Mobile Money or bank details for manual deposits. Enable Korapay for automatic Ghana, Nigeria, and other Korapay-country checkout. Confirm matching manual payments only — Korapay credits the wallet automatically, without admin approval.</p>
        </div>
        <Button onClick={() => setEditing("new")}>Add manual method</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {methods.data?.map((m) => {
          const cfg = m.config ?? {};
          return (
            <Card key={String(m.id)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{m.name}</h2>
                  <p className="text-xs text-slate-500">{m.adapter} · {m.code}</p>
                </div>
                <Badge className={statusTone[m.is_enabled ? "active" : "inactive"]}>{m.is_enabled ? "Enabled" : "Disabled"}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {cfg.network && <p>Network: {cfg.network}</p>}
                {cfg.momoNumber && <p>Number: {cfg.momoNumber}</p>}
                {cfg.accountName && <p>Account name: {cfg.accountName}</p>}
                {cfg.bankName && <p>Bank: {cfg.bankName} {cfg.accountNumber}</p>}
                {cfg.instructions && <p>{cfg.instructions}</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={() => setEditing(m)}>Edit details</Button>
                <Button variant="outline" onClick={async () => {
                  await api(`/admin/payments/methods/${m.id}`, { method: "PATCH", body: JSON.stringify({ isEnabled: !m.is_enabled }) });
                  qc.invalidateQueries({ queryKey: ["admin-methods"] });
                }}>{m.is_enabled ? "Disable" : "Enable"}</Button>
              </div>
            </Card>
          );
        })}
      </div>
      {editing && <PaymentMethodModal method={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <Card className="overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-bold">Incoming payments</h2>
          <Input className="max-w-xs" placeholder="Search unique code, name, or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select className="max-w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
          </Select>
        </div>
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Unique code","User","Type","Amount","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {payments.data?.items.map((p) => (
              <tr key={String(p.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-mono text-sm font-bold">{String(p.deposit_code || p.user_deposit_code || "—")}</td>
                <td className="p-2">{String(p.full_name || "")}<div className="text-xs text-slate-500">{String(p.email)}</div></td>
                <td className="p-2">
                  {String(p.purpose) === "reseller_upgrade" ? "Reseller upgrade" : "Wallet deposit"}
                  <div className="text-xs text-slate-500">{isCardMethod(String(p.adapter || "")) ? "Korapay automatic" : String(p.method_name || "Manual")}</div>
                </td>
                <td className="p-2">
                  {money(Number(p.amount))}
                  {Number((p.metadata as { chargedAmount?: number } | null)?.chargedAmount) > Number(p.amount) && (
                    <div className="text-xs text-slate-500">Paid {money(Number((p.metadata as { chargedAmount: number }).chargedAmount))} incl. tax</div>
                  )}
                </td>
                <td className="p-2"><Badge className={statusTone[String(p.status)]}>{String(p.status)}</Badge></td>
                <td className="p-2 space-x-2">
                  {p.status === "pending" && (
                    isCardMethod(String(p.adapter || "")) ? (
                      <>
                        <span className="text-xs font-semibold text-slate-500">Automatic — no admin confirm</span>
                        <button className="font-semibold text-brand-700" onClick={async () => {
                          try {
                            await api(`/admin/payments/${encodeURIComponent(String(p.reference))}/confirm`, { method: "POST" });
                            toast.success(String(p.purpose) === "reseller_upgrade" ? "Korapay confirmed. Promoted to reseller" : "Korapay confirmed. Wallet credited");
                            qc.invalidateQueries({ queryKey: ["admin-payments"] });
                            qc.invalidateQueries({ queryKey: ["reseller-applications"] });
                            qc.invalidateQueries({ queryKey: ["resellers"] });
                          } catch (e) {
                            toast.error(e instanceof ApiError ? e.message : "Korapay has not confirmed this payment yet");
                          }
                        }}>Check Korapay</button>
                        <button className="font-semibold text-rose-600" onClick={async () => {
                          await api(`/admin/payments/${encodeURIComponent(String(p.reference))}/reject`, { method: "POST" });
                          qc.invalidateQueries({ queryKey: ["admin-payments"] });
                          qc.invalidateQueries({ queryKey: ["reseller-applications"] });
                        }}>Reject</button>
                      </>
                    ) : (
                    <>
                      <button className="font-semibold text-brand-700" onClick={async () => { await api(`/admin/payments/${encodeURIComponent(String(p.reference))}/confirm`, { method: "POST" }); toast.success(String(p.purpose) === "reseller_upgrade" ? "Promoted to reseller" : "Wallet credited"); qc.invalidateQueries({ queryKey: ["admin-payments"] }); qc.invalidateQueries({ queryKey: ["reseller-applications"] }); qc.invalidateQueries({ queryKey: ["resellers"] }); }}>Confirm</button>
                      <button className="font-semibold text-rose-600" onClick={async () => { await api(`/admin/payments/${encodeURIComponent(String(p.reference))}/reject`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["admin-payments"] }); qc.invalidateQueries({ queryKey: ["reseller-applications"] }); }}>Reject</button>
                    </>
                    )
                  )}
                </td>
              </tr>
            ))}
            {!payments.data?.items.length && (
              <tr><td className="p-3 text-slate-500" colSpan={6}>No payments in this view.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function PaymentMethodModal({ method, onClose }: { method: PaymentMethod | null; onClose: () => void }) {
  const qc = useQueryClient();
  const cfg = method?.config ?? {};
  const [form, setForm] = useState({
    name: method?.name ?? "Mobile Money",
    description: method?.description ?? "Manual confirmation after the customer pays.",
    adapter: method?.adapter ?? "manual",
    isEnabled: method?.is_enabled !== false,
    network: cfg.network ?? "MTN Mobile Money",
    momoNumber: cfg.momoNumber ?? "",
    accountName: cfg.accountName ?? "",
    bankName: cfg.bankName ?? "",
    accountNumber: cfg.accountNumber ?? "",
    instructions: cfg.instructions ?? "",
  });
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <Modal open title={method ? "Edit payment details" : "Add manual payment"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="label">Display name</span><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="block"><span className="label">Type</span>
          <Select value={form.adapter} onChange={(e) => set("adapter", e.target.value)} disabled={Boolean(method)}>
            <option value="manual">Manual (MoMo / bank)</option>
            <option value="korapay">Korapay (automatic)</option>
            <option value="paystack">Card / Paystack (legacy)</option>
            <option value="mock">Instant demo top-up</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" checked={form.isEnabled} onChange={(e) => set("isEnabled", e.target.checked)} /> Enabled
        </label>
        <label className="block"><span className="label">Network</span><Input placeholder="MTN / Telecel / AirtelTigo" value={form.network} onChange={(e) => set("network", e.target.value)} /></label>
        <label className="block"><span className="label">MoMo / wallet number</span><Input value={form.momoNumber} onChange={(e) => set("momoNumber", e.target.value)} /></label>
        <label className="block"><span className="label">Account name</span><Input value={form.accountName} onChange={(e) => set("accountName", e.target.value)} /></label>
        <label className="block"><span className="label">Bank name</span><Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="label">Bank account number</span><Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="label">Extra instructions</span><Textarea placeholder="Send as merchant payment. Customers already have a unique payment code to put in the note." value={form.instructions} onChange={(e) => set("instructions", e.target.value)} /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => {
          const payload = {
            name: form.name,
            description: form.description,
            adapter: form.adapter,
            isEnabled: form.isEnabled,
            config: {
              network: form.network,
              momoNumber: form.momoNumber,
              accountName: form.accountName,
              bankName: form.bankName,
              accountNumber: form.accountNumber,
              instructions: form.instructions,
            },
          };
          try {
            if (method?.id) await api(`/admin/payments/methods/${method.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            else await api("/admin/payments/methods", { method: "POST", body: JSON.stringify(payload) });
            toast.success("Payment details saved");
            qc.invalidateQueries({ queryKey: ["admin-methods"] });
            qc.invalidateQueries({ queryKey: ["pay-methods"] });
            onClose();
          } catch (e) { toast.error(e instanceof ApiError ? e.message : "Save failed"); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}

export function AdminWallets() {
  const [search, setSearch] = useState("");
  const wallets = useQuery({ queryKey: ["admin-wallets", search], queryFn: () => api<Record<string, unknown>[]>(`/admin/wallets?search=${encodeURIComponent(search)}`) });
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Wallets</h1>
      <Input className="mt-4 max-w-sm" placeholder="Search user or payment code" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["User","Code","Role","Balance"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {wallets.data?.map((w) => (
              <tr key={String(w.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(w.full_name)}<div className="text-xs text-slate-500">{String(w.email)}</div></td>
                <td className="p-2 font-mono text-xs font-semibold">{String(w.deposit_code || "—")}</td>
                <td className="p-2 capitalize">{String(w.role)}</td>
                <td className="p-2 font-semibold">{money(Number(w.balance))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AdminSupport() {
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api<Record<string, unknown>[]>("/admin/support") });
  const [active, setActive] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["ticket", active],
    queryFn: () => api<{ ticket: Record<string, unknown>; messages: Record<string, unknown>[] }>(`/support/${active}`),
    enabled: !!active,
  });
  const [reply, setReply] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h1 className="font-extrabold">Tickets</h1>
        <ul className="mt-3 space-y-2">
          {tickets.data?.map((t) => (
            <li key={String(t.id)}>
              <button className="w-full rounded-xl p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setActive(String(t.id))}>
                <p className="font-semibold">{String(t.subject)}</p>
                <p className="text-xs text-slate-500">{String(t.public_id)} · {String(t.status)}</p>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="lg:col-span-2">
        {!active && <p className="text-slate-500">Select a ticket</p>}
        {detail.data && (
          <div>
            <div className="flex justify-between">
              <h2 className="font-bold">{String(detail.data.ticket.subject)}</h2>
              <Select defaultValue={String(detail.data.ticket.status)} onChange={async (e) => { await api(`/admin/support/${active}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); }}>
                {["open","pending","resolved","closed"].map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div className="mt-4 space-y-3">
              {detail.data.messages.map((m) => (
                <div key={String(m.id)} className={`rounded-xl p-3 ${m.is_staff ? "bg-brand-50 dark:bg-brand-500/10" : "bg-slate-50 dark:bg-slate-800"}`}>
                  <p className="text-xs text-slate-500">{String(m.full_name)}</p>
                  <p>{String(m.message)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button onClick={async () => { await api(`/support/${active}/reply`, { method: "POST", body: JSON.stringify({ message: reply }) }); setReply(""); qc.invalidateQueries({ queryKey: ["ticket", active] }); }}>Reply</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function AdminSettings() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Record<string, Record<string, unknown>>>("/admin/settings") });
  const save = async (key: string, value: unknown) => {
    await api(`/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["public-settings"] });
  };
  const g = settings.data?.general ?? {};
  const [general, setGeneral] = useState<Record<string, string> | null>(null);
  const form = general ?? {
    siteName: String(g.siteName ?? ""),
    tagline: String(g.tagline ?? ""),
    supportEmail: String(g.supportEmail ?? ""),
    contactPhone: String(g.contactPhone ?? ""),
    whatsappNumber: String(g.whatsappNumber ?? ""),
    whatsappChannelUrl: String(g.whatsappChannelUrl ?? ""),
    address: String(g.address ?? ""),
    developer: String(g.developer ?? ""),
    currency: String(g.currency ?? "GHS"),
  };
  const channelItems = ((settings.data?.channels?.items as { name?: string; url?: string; kind?: string }[]) ?? []);
  const [channels, setChannels] = useState<{ name: string; url: string; kind: string }[] | null>(null);
  const items = channels ?? channelItems.map((c) => ({ name: String(c.name ?? ""), url: String(c.url ?? ""), kind: String(c.kind ?? "other") }));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Settings</h1>
      <GoogleOAuthSettingsCard />
      <Card>
        <h2 className="font-bold">Business & customer service</h2>
        <p className="mt-1 text-sm text-slate-500">These details appear on the website footer, the bottom help bar, and the support page.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block"><span className="label">Site name</span><Input value={form.siteName} onChange={(e) => setGeneral({ ...form, siteName: e.target.value })} /></label>
          <label className="block"><span className="label">Currency</span><Input value={form.currency} onChange={(e) => setGeneral({ ...form, currency: e.target.value })} /></label>
          <label className="block md:col-span-2"><span className="label">Tagline</span><Input value={form.tagline} onChange={(e) => setGeneral({ ...form, tagline: e.target.value })} /></label>
          <label className="block"><span className="label">Support email</span><Input value={form.supportEmail} onChange={(e) => setGeneral({ ...form, supportEmail: e.target.value })} /></label>
          <label className="block"><span className="label">Customer service number</span><Input placeholder="+233 24 000 0000" value={form.contactPhone} onChange={(e) => setGeneral({ ...form, contactPhone: e.target.value })} /></label>
          <label className="block"><span className="label">WhatsApp number</span><Input placeholder="233240000000" value={form.whatsappNumber} onChange={(e) => setGeneral({ ...form, whatsappNumber: e.target.value })} /></label>
          <label className="block md:col-span-2">
            <span className="label">WhatsApp Channel URL</span>
            <Input
              placeholder="https://www.whatsapp.com/channel/..."
              value={form.whatsappChannelUrl}
              onChange={(e) => setGeneral({ ...form, whatsappChannelUrl: e.target.value })}
            />
            <span className="mt-1 block text-xs text-slate-500">This is the follow-channel invite link for the green WhatsApp Channel button on mobile. It is not the support ticket page.</span>
          </label>
          <label className="block"><span className="label">Address</span><Input value={form.address} onChange={(e) => setGeneral({ ...form, address: e.target.value })} /></label>
        </div>
        <Button className="mt-4" onClick={() => save("general", { ...g, ...form })}>Save contact details</Button>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Channels & communities</h2>
            <p className="mt-1 text-sm text-slate-500">Add Telegram, WhatsApp community, Discord or any other public link.</p>
          </div>
          <Button variant="outline" onClick={() => setChannels([...items, { name: "", url: "", kind: "telegram" }])}>Add link</Button>
        </div>
        <div className="mt-4 space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-7">
              <Select className="md:col-span-2" value={item.kind} onChange={(e) => setChannels(items.map((row, i) => i === index ? { ...row, kind: e.target.value } : row))}>
                <option value="channel">Channel</option>
            <option value="group">Group</option>
            <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="community">Community</option>
                <option value="discord">Discord</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="other">Other</option>
              </Select>
              <Input className="md:col-span-2" placeholder="Label (e.g. Telegram channel)" value={item.name} onChange={(e) => setChannels(items.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
              <Input className="md:col-span-2" placeholder="https://t.me/yourchannel" value={item.url} onChange={(e) => setChannels(items.map((row, i) => i === index ? { ...row, url: e.target.value } : row))} />
              <Button variant="outline" onClick={() => setChannels(items.filter((_, i) => i !== index))}>Remove</Button>
            </div>
          ))}
          {!items.length && <p className="text-sm text-slate-500">No channel links yet.</p>}
        </div>
        <Button className="mt-4" onClick={() => save("channels", { items: items.filter((item) => item.name && item.url) })}>Save channels</Button>
      </Card>
      <OrdersSettingsCard data={settings.data?.orders} onSave={(value) => save("orders", value)} />
      <KorapayFeesSettingsCard data={settings.data?.payments} onSave={(value) => save("payments", value)} />
      <AffiliateSettingsCard data={settings.data?.affiliates} onSave={(value) => save("affiliates", value)} />
      <LoyaltySettingsCard data={settings.data?.loyalty} onSave={(value) => save("loyalty", value)} />
      <MailSettingsCard data={settings.data?.mail} onSave={(value) => save("mail", value)} />
      <ResellerUpgradeSettingsCard data={settings.data?.resellers} onSave={(value) => save("resellers", value)} />
      <ChildPanelSettingsCard data={settings.data?.childPanels} onSave={(value) => save("childPanels", value)} />
      <PricingSettingsCard data={settings.data?.pricing} onSave={(value) => save("pricing", value)} />
      <NotificationSettingsCard data={settings.data?.notifications} onSave={(value) => save("notifications", value)} />
    </div>
  );
}

function GoogleOAuthSettingsCard() {
  const config = useQuery({
    queryKey: ["google-config"],
    queryFn: () => api<{ origin?: string; redirectUri?: string; enabled?: boolean; redirectEnabled?: boolean; clientId?: string | null }>("/auth/google/config"),
  });
  const redirectUri = config.data?.redirectUri || "https://linkboostgrowth.site/api/auth/google/callback";
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <Card>
      <h2 className="font-bold">Google sign-in</h2>
      <p className="mt-1 text-sm text-slate-500">
        Live Google login uses a full-page redirect to this exact Authorized redirect URI on the
        {" "}<a className="font-semibold text-brand-700" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Web application OAuth client</a>
        {" "}that matches <span className="font-mono">GOOGLE_CLIENT_ID</span>. Public site: <span className="font-mono">https://linkboostgrowth.site</span>.
      </p>
      {!config.data?.enabled && <p className="mt-2 text-sm text-amber-700">GOOGLE_CLIENT_ID is not set on the server yet.</p>}
      {config.data?.enabled && !config.data.redirectEnabled && (
        <p className="mt-2 text-sm text-amber-700">GOOGLE_CLIENT_SECRET is missing, so Continue with Google cannot start.</p>
      )}
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Authorized redirect URI</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg bg-slate-50 px-2 py-1 font-mono text-xs dark:bg-slate-800">{redirectUri}</code>
        <button type="button" className="text-xs font-semibold text-brand-700" onClick={() => copy(redirectUri)}>Copy</button>
      </div>
    </Card>
  );
}

function OrdersSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    autoProcessing: String(source.autoProcessing !== false),
    maxPendingPerUser: String(source.maxPendingPerUser ?? 20),
    refundWindowHours: String(source.refundWindowHours ?? 48),
  };
  return (
    <Card>
      <h2 className="font-bold">Orders</h2>
      <p className="mt-1 text-sm text-slate-500">
        After a customer pays from their wallet, send the order to the SMM panel you connected in Providers. If the panel rejects it, the order stays pending so you can send it again — the wallet is not refunded automatically.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">Send paid orders to the provider automatically</span>
          <Select value={values.autoProcessing} onChange={(e) => setForm({ ...values, autoProcessing: e.target.value })}>
            <option value="true">On</option>
            <option value="false">Off — admin sends manually</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">Refund window (hours)</span>
          <Input type="number" min="0" value={values.refundWindowHours} onChange={(e) => setForm({ ...values, refundWindowHours: e.target.value })} />
        </label>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        ...source,
        autoProcessing: values.autoProcessing === "true",
        maxPendingPerUser: Number(values.maxPendingPerUser || 20),
        refundWindowHours: Number(values.refundWindowHours || 48),
      })}>Save order settings</Button>
    </Card>
  );
}

function KorapayFeesSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    korapayCustomerPaysFees: String(source.korapayCustomerPaysFees !== false),
    korapayFeePercent: String(source.korapayFeePercent ?? 1.5),
    korapayVatPercent: String(source.korapayVatPercent ?? 15),
  };
  const enabledCurrencies = Array.isArray(source.korapayCurrencies) && source.korapayCurrencies.length
    ? source.korapayCurrencies.map((code) => String(code).toUpperCase())
    : KORAPAY_MARKETS.map((item) => item.currency);
  const [currencies, setCurrencies] = useState<string[] | null>(null);
  const selectedCurrencies = currencies ?? enabledCurrencies;
  const toggleCurrency = (code: string) => {
    setCurrencies((current) => {
      const next = new Set(current ?? selectedCurrencies);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      const list = KORAPAY_MARKETS.map((item) => item.currency).filter((item) => next.has(item));
      return list.length ? list : [code];
    });
  };
  return (
    <Card>
      <h2 className="font-bold">Korapay (automatic)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Wallet stays in GHS. Customers pick Ghana, Nigeria, or another Korapay country; they pay in that currency and the wallet is credited in GHS after Korapay confirms. Enable the same currencies on your Korapay dashboard.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="label">Customer pays Korapay fees</span>
          <Select value={values.korapayCustomerPaysFees} onChange={(e) => setForm({ ...values, korapayCustomerPaysFees: e.target.value })}>
            <option value="true">Yes — add fee and tax</option>
            <option value="false">No — business absorbs them</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">Processing fee %</span>
          <Input type="number" min="0" step="0.01" value={values.korapayFeePercent} onChange={(e) => setForm({ ...values, korapayFeePercent: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">VAT / tax % on the fee</span>
          <Input type="number" min="0" step="0.01" value={values.korapayVatPercent} onChange={(e) => setForm({ ...values, korapayVatPercent: e.target.value })} />
        </label>
      </div>
      <div className="mt-4">
        <p className="label">Checkout countries</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {KORAPAY_MARKETS.map((market) => (
            <label key={market.currency} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedCurrencies.includes(market.currency)}
                onChange={() => toggleCurrency(market.currency)}
              />
              <span>
                <strong>{market.country}</strong> · {market.currency}
                <span className="block text-xs text-slate-500">{market.methods}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        ...source,
        korapayCustomerPaysFees: values.korapayCustomerPaysFees === "true",
        korapayFeePercent: Number(values.korapayFeePercent || 0),
        korapayVatPercent: Number(values.korapayVatPercent || 0),
        korapayCurrencies: selectedCurrencies,
      })}>Save Korapay settings</Button>
    </Card>
  );
}

function MailSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [testing, setTesting] = useState(false);
  const values = form ?? {
    enabled: String(source.enabled !== false),
    host: String(source.host ?? ""),
    port: String(source.port ?? 587),
    user: String(source.user ?? ""),
    pass: "",
    from: String(source.from ?? "LinkBoost Growth SMM <support@linkboostgrowth.com>"),
  };
  return (
    <Card>
      <h2 className="font-bold">Password reset email (SMTP)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Forgot password needs a mail server. For Gmail use host <span className="font-mono">smtp.gmail.com</span>, port <span className="font-mono">587</span>, your Gmail address, and a Google <strong>App Password</strong> (not your normal Gmail password).
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">Enabled</span>
          <Select value={values.enabled} onChange={(e) => setForm({ ...values, enabled: e.target.value })}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">SMTP host</span>
          <Input placeholder="smtp.gmail.com" value={values.host} onChange={(e) => setForm({ ...values, host: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Port</span>
          <Input placeholder="587" value={values.port} onChange={(e) => setForm({ ...values, port: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">From address</span>
          <Input placeholder="LinkBoost Growth SMM <you@gmail.com>" value={values.from} onChange={(e) => setForm({ ...values, from: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">SMTP username</span>
          <Input placeholder="you@gmail.com" value={values.user} onChange={(e) => setForm({ ...values, user: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">SMTP password / App Password</span>
          <PasswordInput placeholder={source.passSet ? "Saved — leave blank to keep" : "Google App Password"} value={values.pass} onChange={(e) => setForm({ ...values, pass: e.target.value })} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onSave({
          enabled: values.enabled === "true",
          host: values.host.trim(),
          port: Number(values.port || 587),
          user: values.user.trim(),
          pass: values.pass,
          from: values.from.trim(),
        })}>Save mail settings</Button>
        <Button
          variant="outline"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            try {
              await api("/admin/settings/mail/test", { method: "POST", body: JSON.stringify({}) });
              toast.success("Test email sent to your admin email");
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Could not send test email");
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "Sending..." : "Send test email"}
        </Button>
      </div>
    </Card>
  );
}

function AffiliateSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    enabled: String(source.enabled !== false),
    commissionPercent: String(source.commissionPercent ?? 7),
    minimumPayout: String(source.minimumPayout ?? 10),
  };
  return (
    <Card>
      <h2 className="font-bold">Affiliates</h2>
      <p className="mt-1 text-sm text-slate-500">Lifetime commission on referred users’ wallet deposits. Commission is credited to the referrer wallet and can be used to order services.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="label">Enabled</span>
          <Select value={values.enabled} onChange={(e) => setForm({ ...values, enabled: e.target.value })}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">Commission %</span>
          <Input type="number" value={values.commissionPercent} onChange={(e) => setForm({ ...values, commissionPercent: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Minimum payout (GHS)</span>
          <Input type="number" value={values.minimumPayout} onChange={(e) => setForm({ ...values, minimumPayout: e.target.value })} />
        </label>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        enabled: values.enabled === "true",
        commissionPercent: Number(values.commissionPercent),
        minimumPayout: Number(values.minimumPayout),
        lifetime: true,
      })}>Save affiliates</Button>
    </Card>
  );
}

function LoyaltySettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const qc = useQueryClient();
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    newSpendGhs: String(source.newSpendGhs ?? 1000),
    frequentSpendGhs: String(source.frequentSpendGhs ?? 5000),
    vipSpendGhs: String(source.vipSpendGhs ?? 10000),
    frequentDiscountPercent: String(source.frequentDiscountPercent ?? 2),
    vipDiscountPercent: String(source.vipDiscountPercent ?? 10),
    lotteryUsd: String(source.lotteryUsd ?? 100),
  };
  const lastLottery = source.lastLottery as { name?: string; email?: string; amount?: number; lotteryUsd?: number; drawnAt?: string } | null;
  const draw = useMutation({
    mutationFn: () => api<{ name: string; email: string; amount: number; lotteryUsd: number }>("/admin/loyalty/lottery", { method: "POST" }),
    onSuccess: (winner) => {
      toast.success(`${winner.name} won $${winner.lotteryUsd}`);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not draw the lottery"),
  });
  return (
    <Card>
      <h2 className="font-bold">Customer loyalty</h2>
      <p className="mt-1 text-sm text-slate-500">
        Tiers are based on lifetime order spend. Discounts apply to customer catalog prices only. VIP members get a one-time free child panel and can enter the $100 monthly lottery.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="label">New Member spend (GHS)</span>
          <Input type="number" min="0" value={values.newSpendGhs} onChange={(e) => setForm({ ...values, newSpendGhs: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Frequent spend (GHS)</span>
          <Input type="number" min="0" value={values.frequentSpendGhs} onChange={(e) => setForm({ ...values, frequentSpendGhs: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">VIP spend (GHS)</span>
          <Input type="number" min="0" value={values.vipSpendGhs} onChange={(e) => setForm({ ...values, vipSpendGhs: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Frequent discount %</span>
          <Input type="number" min="0" value={values.frequentDiscountPercent} onChange={(e) => setForm({ ...values, frequentDiscountPercent: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">VIP discount %</span>
          <Input type="number" min="0" value={values.vipDiscountPercent} onChange={(e) => setForm({ ...values, vipDiscountPercent: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Lottery (USD)</span>
          <Input type="number" min="0" value={values.lotteryUsd} onChange={(e) => setForm({ ...values, lotteryUsd: e.target.value })} />
        </label>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        ...source,
        newSpendGhs: Number(values.newSpendGhs),
        frequentSpendGhs: Number(values.frequentSpendGhs),
        vipSpendGhs: Number(values.vipSpendGhs),
        frequentDiscountPercent: Number(values.frequentDiscountPercent),
        vipDiscountPercent: Number(values.vipDiscountPercent),
        lotteryUsd: Number(values.lotteryUsd),
        lastLottery: source.lastLottery ?? null,
      })}>Save loyalty</Button>
      <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
        <p className="text-sm font-semibold">VIP monthly lottery</p>
        {lastLottery?.name ? (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Last winner: {lastLottery.name} ({lastLottery.email}) · ${lastLottery.lotteryUsd ?? 100}
            {lastLottery.amount != null ? ` / ${money(lastLottery.amount)}` : ""}
            {lastLottery.drawnAt ? ` · ${formatDate(lastLottery.drawnAt)}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No draw yet. Credits a random VIP member ${values.lotteryUsd} converted to GHS.</p>
        )}
        <Button className="mt-3" variant="outline" disabled={draw.isPending} onClick={() => draw.mutate()}>
          {draw.isPending ? "Drawing…" : "Draw VIP lottery"}
        </Button>
      </div>
    </Card>
  );
}

function ResellerUpgradeSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    upgradeEnabled: String(source.upgradeEnabled !== false),
    upgradeFee: String(source.upgradeFee ?? 200),
    upgradeNote: String(source.upgradeNote ?? ""),
  };
  return (
    <Card>
      <h2 className="font-bold">Reseller upgrade</h2>
      <p className="mt-1 text-sm text-slate-500">Customers pay this fee by Mobile Money. After you confirm the payment on Resellers, their dashboard switches from customer to reseller. Child panels are a separate product.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">Enabled</span>
          <Select value={values.upgradeEnabled} onChange={(e) => setForm({ ...values, upgradeEnabled: e.target.value })}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">Upgrade fee (GHS)</span>
          <Input type="number" min="0" value={values.upgradeFee} onChange={(e) => setForm({ ...values, upgradeFee: e.target.value })} />
        </label>
        <label className="block md:col-span-2">
          <span className="label">Note shown to customers</span>
          <Textarea value={values.upgradeNote} onChange={(e) => setForm({ ...values, upgradeNote: e.target.value })} />
        </label>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        upgradeEnabled: values.upgradeEnabled === "true",
        upgradeFee: Number(values.upgradeFee),
        upgradeNote: values.upgradeNote,
      })}>Save upgrade fee</Button>
    </Card>
  );
}

function ChildPanelSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const nameservers = Array.isArray(source.nameservers) ? source.nameservers.map(String) : ["ns1.linkboostgrowth.site", "ns2.linkboostgrowth.site"];
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    enabled: String(source.enabled !== false),
    monthlyPrice: String(source.monthlyPrice ?? 220),
    ns1: String(nameservers[0] ?? "ns1.linkboostgrowth.site"),
    ns2: String(nameservers[1] ?? "ns2.linkboostgrowth.site"),
  };
  return (
    <Card>
      <h2 className="font-bold">Child panel</h2>
      <p className="mt-1 text-sm text-slate-500">Hosted panel on the customer’s domain. Charged from wallet at the monthly price. Customers point their domain to these nameservers.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">Enabled</span>
          <Select value={values.enabled} onChange={(e) => setForm({ ...values, enabled: e.target.value })}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">Price per month (GHS)</span>
          <Input type="number" min="0" value={values.monthlyPrice} onChange={(e) => setForm({ ...values, monthlyPrice: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Nameserver 1</span>
          <Input value={values.ns1} onChange={(e) => setForm({ ...values, ns1: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Nameserver 2</span>
          <Input value={values.ns2} onChange={(e) => setForm({ ...values, ns2: e.target.value })} />
        </label>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        enabled: values.enabled === "true",
        monthlyPrice: Number(values.monthlyPrice),
        nameservers: [values.ns1, values.ns2].map((item) => item.trim()).filter(Boolean),
        currencies: source.currencies ?? [
          { code: "USD", name: "U.S. Dollar (USD)" },
          { code: "EUR", name: "Euro (EUR)" },
          { code: "GBP", name: "Pound Sterling (GBP)" },
          { code: "GHS", name: "Ghana Cedi (GHS)" },
        ],
      })}>Save child panel</Button>
    </Card>
  );
}

function PricingSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    usdToGhs: String(source.usdToGhs ?? 15.4),
    importMarkupPercent: String(source.importMarkupPercent ?? 40),
    resellerMarkupPercent: String(source.resellerMarkupPercent ?? 15),
    minimumProfitPer1000: String(source.minimumProfitPer1000 ?? 0.5),
  };
  return (
    <Card>
      <h2 className="font-bold">Your prices</h2>
      <p className="mt-1 text-sm text-slate-500">Provider rates are usually USD per 1,000. We convert to GHS, then add your percent. That percent is your profit on top of provider cost.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block"><span className="label">USD to GHS</span><Input type="number" value={values.usdToGhs} onChange={(e) => setForm({ ...values, usdToGhs: e.target.value })} /></label>
        <label className="block"><span className="label">Your percent %</span><Input type="number" value={values.importMarkupPercent} onChange={(e) => setForm({ ...values, importMarkupPercent: e.target.value })} /></label>
        <label className="block"><span className="label">Reseller percent %</span><Input type="number" value={values.resellerMarkupPercent} onChange={(e) => setForm({ ...values, resellerMarkupPercent: e.target.value })} /></label>
        <label className="block"><span className="label">Minimum profit / 1,000 (GHS)</span><Input type="number" value={values.minimumProfitPer1000} onChange={(e) => setForm({ ...values, minimumProfitPer1000: e.target.value })} /></label>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        ...source,
        usdToGhs: Number(values.usdToGhs),
        importMarkupPercent: Number(values.importMarkupPercent),
        resellerMarkupPercent: Number(values.resellerMarkupPercent),
        minimumProfitPer1000: Number(values.minimumProfitPer1000),
      })}>Save pricing</Button>
    </Card>
  );
}

function NotificationSettingsCard({
  data,
  onSave,
}: {
  data?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const source = data ?? {};
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    refillNotifications: String(source.refillNotifications !== false),
    orderNotifications: String(source.orderNotifications !== false),
    depositNotifications: String(source.depositNotifications !== false),
  };
  return (
    <Card>
      <h2 className="font-bold">Notifications</h2>
      <p className="mt-1 text-sm text-slate-500">Control whether customers are notified when an order becomes eligible for refill.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="label">Refill available</span>
          <Select value={values.refillNotifications} onChange={(e) => setForm({ ...values, refillNotifications: e.target.value })}>
            <option value="true">Notify customer</option>
            <option value="false">Do not notify</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">Order updates</span>
          <Select value={values.orderNotifications} onChange={(e) => setForm({ ...values, orderNotifications: e.target.value })}>
            <option value="true">On</option>
            <option value="false">Off</option>
          </Select>
        </label>
        <label className="block">
          <span className="label">Deposits</span>
          <Select value={values.depositNotifications} onChange={(e) => setForm({ ...values, depositNotifications: e.target.value })}>
            <option value="true">On</option>
            <option value="false">Off</option>
          </Select>
        </label>
      </div>
      <Button className="mt-4" onClick={() => onSave({
        ...source,
        refillNotifications: values.refillNotifications === "true",
        orderNotifications: values.orderNotifications === "true",
        depositNotifications: values.depositNotifications === "true",
      })}>Save notifications</Button>
    </Card>
  );
}

const audienceLabels: Record<string, string> = {
  customers: "Customers",
  resellers: "Resellers",
  child_panels: "Child panels",
  all: "All users",
  user: "One user",
};

export function AdminNotifications() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("customers");
  const [userSearch, setUserSearch] = useState("");
  const [picked, setPicked] = useState<User | null>(null);
  const counts = useQuery({
    queryKey: ["admin-notification-counts"],
    queryFn: () => api<{ customers: number; resellers: number; child_panels: number; all: number }>("/admin/notifications/counts"),
  });
  const sent = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => api<Record<string, unknown>[]>("/admin/notifications"),
  });
  const users = useQuery({
    queryKey: ["admin-notify-users", userSearch],
    queryFn: () => api<Paginated<User>>(`/admin/users?search=${encodeURIComponent(userSearch)}&status=active`),
    enabled: audience === "user" && userSearch.trim().length >= 2,
  });
  const recipientCount = audience === "user"
    ? (picked ? 1 : 0)
    : Number(counts.data?.[audience === "all" ? "all" : audience as "customers" | "resellers" | "child_panels"] ?? 0);

  const send = useMutation({
    mutationFn: () => api("/admin/notifications", {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        audience,
        userId: audience === "user" ? picked?.id : undefined,
      }),
    }),
    onSuccess: (data) => {
      const count = (data as { recipientCount?: number })?.recipientCount ?? recipientCount;
      toast.success(`Notification sent to ${count} ${count === 1 ? "recipient" : "recipients"}`);
      setTitle("");
      setBody("");
      setPicked(null);
      setUserSearch("");
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to send"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">Send an announcement to customers, resellers, or child panels. It appears in each recipient’s Notifications inbox.</p>
      </div>
      <Card>
        <h2 className="font-bold">Compose</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="label">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maintenance window, new services, promo…" />
          </label>
          <label className="block">
            <span className="label">Message</span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the message recipients will see." />
          </label>
          <fieldset>
            <legend className="label mb-2">Send to</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {[
                { value: "customers", label: "Customers", hint: `${counts.data?.customers ?? "…"} active customers` },
                { value: "resellers", label: "Resellers", hint: `${counts.data?.resellers ?? "…"} reseller accounts` },
                { value: "child_panels", label: "Child panels", hint: `${counts.data?.child_panels ?? "…"} resellers with an active storefront` },
                { value: "all", label: "Everyone", hint: `${counts.data?.all ?? "…"} customers and resellers` },
                { value: "user", label: "One user", hint: "Search and pick a specific account" },
              ].map((option) => (
                <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${audience === option.value ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-200 dark:border-slate-800"}`}>
                  <input type="radio" name="audience" className="mt-1" checked={audience === option.value} onChange={() => { setAudience(option.value); setPicked(null); }} />
                  <span>
                    <span className="block font-semibold">{option.label}</span>
                    <span className="text-xs text-slate-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {audience === "user" && (
            <div>
              <span className="label">Find user</span>
              {picked ? (
                <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div>
                    <p className="font-semibold">{picked.full_name}</p>
                    <p className="text-xs text-slate-500">{picked.email} · {picked.role}</p>
                  </div>
                  <Button variant="outline" onClick={() => setPicked(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input className="mt-1" placeholder="Search name or email" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                  <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                    {users.data?.items.filter((u) => u.role !== "admin").map((u) => (
                      <li key={u.id}>
                        <button type="button" className="w-full rounded-xl p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setPicked(u)}>
                          <p className="font-semibold">{u.full_name}</p>
                          <p className="text-xs text-slate-500">{u.email} · {u.role}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Will send to <strong>{recipientCount}</strong> {recipientCount === 1 ? "recipient" : "recipients"}.</p>
            <Button disabled={send.isPending || !title.trim() || !body.trim() || recipientCount < 1} onClick={() => send.mutate()}>
              {send.isPending ? "Sending…" : "Send notification"}
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="font-bold">Sent</h2>
        <ul className="mt-3 space-y-3">
          {sent.data?.length ? sent.data.map((n) => {
            const meta = (n.metadata ?? {}) as Record<string, unknown>;
            return (
              <li key={String(n.id)} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{String(n.title)}</p>
                  <p className="text-xs text-slate-500">{formatDate(String(n.created_at))}</p>
                </div>
                <p className="text-sm text-slate-500">{String(n.body)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {audienceLabels[String(meta.audience)] ?? "Audience"} · {String(meta.recipientCount ?? 0)} recipients
                  {meta.sentByName ? ` · ${String(meta.sentByName)}` : ""}
                </p>
              </li>
            );
          }) : <p className="text-sm text-slate-500">No admin notifications sent yet.</p>}
        </ul>
      </Card>
    </div>
  );
}

export function AdminAudit() {
  const logs = useQuery({ queryKey: ["audit"], queryFn: () => api<Paginated<Record<string, unknown>>>("/admin/audit") });
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Audit log</h1>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Admin","Action","Target","Date","IP"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {logs.data?.items.map((l) => (
              <tr key={String(l.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(l.actor_name || "System")}</td>
                <td className="p-2">{String(l.action)}</td>
                <td className="p-2">{String(l.target_type || "")} {String(l.target_id || "")}</td>
                <td className="p-2">{formatDate(String(l.created_at))}</td>
                <td className="p-2">{String(l.ip_address || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
