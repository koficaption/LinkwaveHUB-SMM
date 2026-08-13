import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, formatDate, money, ApiError } from "@/api/client";
import type { Order, Paginated, PaymentMethod, Platform, User } from "@/types";
import { Badge, Button, Card, Input, Modal, Pagination, PasswordInput, Select, Textarea } from "@/components/ui";
import { prettyStatus, statusTone } from "@/utils/cn";

export function AdminOrders() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [active, setActive] = useState<Order | null>(null);
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms?all=1") });
  const orders = useQuery({
    queryKey: ["admin-orders", page, status, search, platformId, from, to],
    queryFn: () => api<Paginated<Order>>(`/admin/orders?page=${page}&status=${status}&search=${encodeURIComponent(search)}&platformId=${platformId}&from=${from}&to=${to}`),
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Orders</h1>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <Input placeholder="Search ID, email, target" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["pending","processing","in_progress","completed","partial","cancelled","refunded","failed"].map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </Select>
        <Select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
          <option value="">All platforms</option>
          {platforms.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Order ID","Customer","Product","Platform","Qty","Amount","Status","Provider","Created","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {orders.data?.items.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-semibold">{o.public_id}</td>
                <td className="p-2">{o.customer_name}<div className="text-xs text-slate-500">{o.customer_email}</div></td>
                <td className="p-2">{o.product_name}</td>
                <td className="p-2">{o.platform_name}</td>
                <td className="p-2">{o.quantity.toLocaleString()}</td>
                <td className="p-2">{money(o.charge)}</td>
                <td className="p-2"><Badge className={statusTone[o.status]}>{prettyStatus(o.status)}</Badge></td>
                <td className="p-2">{o.provider_name || "—"}</td>
                <td className="p-2 text-slate-500">{formatDate(o.created_at)}</td>
                <td className="p-2"><button className="font-semibold text-brand-700" onClick={() => setActive(o)}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.data && <Pagination page={page} total={orders.data.total} limit={orders.data.limit} onPage={setPage} />}
      </Card>
      {active && <OrderDrawer order={active} onClose={() => setActive(null)} onChanged={() => { setActive(null); qc.invalidateQueries({ queryKey: ["admin-orders"] }); }} />}
    </div>
  );
}

function OrderDrawer({ order, onClose, onChanged }: { order: Order; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState(order.status);
  const [note, setNote] = useState(order.admin_note ?? "");
  const act = async (path: string, body?: unknown) => {
    try {
      await api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      toast.success("Order updated");
      onChanged();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Failed"); }
  };
  return (
    <Modal open title={order.public_id} onClose={onClose}>
      <p className="text-sm text-slate-500">{order.product_name} · {order.customer_email}</p>
      <p className="mt-2 break-all text-sm">Target: {order.target}</p>
      <div className="mt-4 space-y-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["pending","processing","in_progress","completed","partial","cancelled","refunded","failed"].map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </Select>
        <Textarea placeholder="Admin note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => { await api(`/admin/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status, note }) }); toast.success("Status saved"); onChanged(); }}>Change status</Button>
          <Button variant="outline" onClick={() => act(`/admin/orders/${order.id}/retry`)}>Retry</Button>
          <Button variant="danger" onClick={() => act(`/admin/orders/${order.id}/refund`, { note })}>Refund</Button>
        </div>
      </div>
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
          <thead><tr className="text-slate-500">{["Name","Email","Role","Status",""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {users.data?.items.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{u.full_name}</td>
                <td className="p-2">{u.email}</td>
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
        <p className="mt-1 text-sm text-slate-500">Customers who paid the reseller / child panel fee. Confirm after you see the Mobile Money payment, and their dashboard switches to reseller.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Customer","Store","Fee","MoMo","Payment","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {(applications.data ?? []).map((a) => (
              <tr key={String(a.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(a.full_name)}<div className="text-xs text-slate-500">{String(a.email)}</div></td>
                <td className="p-2">{String(a.store_name)}</td>
                <td className="p-2">{money(Number(a.fee_amount))}</td>
                <td className="p-2 text-xs">{[a.sender_name, a.sender_number].filter(Boolean).map(String).join(" · ") || "—"}</td>
                <td className="p-2 font-mono text-xs">{String(a.payment_reference || "—")}<div className="font-sans text-slate-500">{prettyStatus(String(a.payment_status || a.method_name || ""))}</div></td>
                <td className="p-2"><Badge className={statusTone[String(a.status)]}>{prettyStatus(String(a.status))}</Badge></td>
                <td className="p-2 space-x-2">
                  {(String(a.status) === "pending_review" || String(a.status) === "pending_payment") && (
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
          <thead><tr className="text-slate-500">{["Store","Owner","Status","Orders","Profit","Wallet","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {list.data?.map((r) => (
              <tr key={String(r.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(r.store_name)}<div className="text-xs text-slate-500">/store/{String(r.store_slug)}</div></td>
                <td className="p-2">{String(r.full_name)}</td>
                <td className="p-2"><Badge className={statusTone[String(r.status)]}>{String(r.status)}</Badge></td>
                <td className="p-2">{String(r.order_count)}</td>
                <td className="p-2">{money(Number(r.total_profit))}</td>
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

export function AdminPayments() {
  const qc = useQueryClient();
  const payments = useQuery({ queryKey: ["admin-payments"], queryFn: () => api<Paginated<Record<string, unknown>>>("/admin/payments") });
  const methods = useQuery({ queryKey: ["admin-methods"], queryFn: () => api<PaymentMethod[]>("/admin/payments/methods") });
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Payments</h1>
          <p className="text-sm text-slate-500">Add Mobile Money, bank or other manual details. Customers see them when they fund their wallet. Instant providers like Korapay can be added later.</p>
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
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Reference","User","Type","Amount","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {payments.data?.items.map((p) => (
              <tr key={String(p.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(p.reference)}</td>
                <td className="p-2">{String(p.email)}</td>
                <td className="p-2">{String(p.purpose) === "reseller_upgrade" ? "Reseller upgrade" : "Wallet deposit"}</td>
                <td className="p-2">{money(Number(p.amount))}</td>
                <td className="p-2"><Badge className={statusTone[String(p.status)]}>{String(p.status)}</Badge></td>
                <td className="p-2 space-x-2">
                  {p.status === "pending" && (
                    <>
                      <button className="font-semibold text-brand-700" onClick={async () => { await api(`/admin/payments/${p.reference}/confirm`, { method: "POST" }); toast.success(String(p.purpose) === "reseller_upgrade" ? "Promoted to reseller" : "Confirmed"); qc.invalidateQueries({ queryKey: ["admin-payments"] }); qc.invalidateQueries({ queryKey: ["reseller-applications"] }); qc.invalidateQueries({ queryKey: ["resellers"] }); }}>Confirm</button>
                      <button className="font-semibold text-rose-600" onClick={async () => { await api(`/admin/payments/${p.reference}/reject`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["admin-payments"] }); qc.invalidateQueries({ queryKey: ["reseller-applications"] }); }}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
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
            <option value="korapay">Card / Korapay</option>
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
        <label className="block sm:col-span-2"><span className="label">Extra instructions</span><Textarea placeholder="Send as merchant payment. Use the deposit reference as the note." value={form.instructions} onChange={(e) => set("instructions", e.target.value)} /></label>
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
      <Input className="mt-4 max-w-sm" placeholder="Search user" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["User","Role","Balance"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {wallets.data?.map((w) => (
              <tr key={String(w.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(w.full_name)}<div className="text-xs text-slate-500">{String(w.email)}</div></td>
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
      <AffiliateSettingsCard data={settings.data?.affiliates} onSave={(value) => save("affiliates", value)} />
      <MailSettingsCard data={settings.data?.mail} onSave={(value) => save("mail", value)} />
      <ResellerUpgradeSettingsCard data={settings.data?.resellers} onSave={(value) => save("resellers", value)} />
      <PricingSettingsCard data={settings.data?.pricing} onSave={(value) => save("pricing", value)} />
    </div>
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
    from: String(source.from ?? "Linkwave SMM <support@linkwavehub.com>"),
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
          <Input placeholder="Linkwave SMM <you@gmail.com>" value={values.from} onChange={(e) => setForm({ ...values, from: e.target.value })} />
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
      <h2 className="font-bold">Reseller / child panel upgrade</h2>
      <p className="mt-1 text-sm text-slate-500">Customers pay this fee by Mobile Money. After you confirm the payment on Resellers, their dashboard switches from customer to reseller.</p>
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
      <h2 className="font-bold">Provider import pricing</h2>
      <p className="mt-1 text-sm text-slate-500">Panel rates are usually USD per 1,000. LinkWaveHub sells in GHS. Re-import packages after you change these numbers.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block"><span className="label">USD to GHS rate</span><Input type="number" value={values.usdToGhs} onChange={(e) => setForm({ ...values, usdToGhs: e.target.value })} /></label>
        <label className="block"><span className="label">Import markup %</span><Input type="number" value={values.importMarkupPercent} onChange={(e) => setForm({ ...values, importMarkupPercent: e.target.value })} /></label>
        <label className="block"><span className="label">Reseller markup %</span><Input type="number" value={values.resellerMarkupPercent} onChange={(e) => setForm({ ...values, resellerMarkupPercent: e.target.value })} /></label>
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
                { value: "child_panels", label: "Child panels", hint: `${counts.data?.child_panels ?? "…"} with an active storefront` },
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
