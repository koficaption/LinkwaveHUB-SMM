import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, formatDate, money, ApiError } from "@/api/client";
import type { Order, Paginated, Platform, User } from "@/types";
import { Badge, Button, Card, Input, Modal, Pagination, Select, Textarea } from "@/components/ui";
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
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Resellers</h1>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
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
  const methods = useQuery({ queryKey: ["admin-methods"], queryFn: () => api<Record<string, unknown>[]>("/admin/payments/methods") });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Payments</h1>
      <Card>
        <h2 className="font-bold">Methods</h2>
        <ul className="mt-3 space-y-2">
          {methods.data?.map((m) => (
            <li key={String(m.id)} className="flex items-center justify-between">
              <span>{String(m.name)} <span className="text-xs text-slate-500">({String(m.adapter)})</span></span>
              <Button variant="outline" onClick={async () => { await api(`/admin/payments/methods/${m.id}`, { method: "PATCH", body: JSON.stringify({ isEnabled: !m.is_enabled }) }); qc.invalidateQueries({ queryKey: ["admin-methods"] }); }}>{m.is_enabled ? "Disable" : "Enable"}</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Reference","User","Amount","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {payments.data?.items.map((p) => (
              <tr key={String(p.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(p.reference)}</td>
                <td className="p-2">{String(p.email)}</td>
                <td className="p-2">{money(Number(p.amount))}</td>
                <td className="p-2"><Badge className={statusTone[String(p.status)]}>{String(p.status)}</Badge></td>
                <td className="p-2 space-x-2">
                  {p.status === "pending" && (
                    <>
                      <button className="font-semibold text-brand-700" onClick={async () => { await api(`/admin/payments/${p.reference}/confirm`, { method: "POST" }); toast.success("Confirmed"); qc.invalidateQueries({ queryKey: ["admin-payments"] }); }}>Confirm</button>
                      <button className="font-semibold text-rose-600" onClick={async () => { await api(`/admin/payments/${p.reference}/reject`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["admin-payments"] }); }}>Reject</button>
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
  };
  const g = settings.data?.general ?? {};
  const [general, setGeneral] = useState<Record<string, string> | null>(null);
  const form = general ?? Object.fromEntries(Object.entries(g).map(([k, v]) => [k, String(v ?? "")]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Settings</h1>
      <Card>
        <h2 className="font-bold">General</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {["siteName","tagline","supportEmail","contactPhone","address","developer","currency"].map((k) => (
            <label key={k} className="block"><span className="label">{k}</span><Input value={form[k] ?? ""} onChange={(e) => setGeneral({ ...form, [k]: e.target.value })} /></label>
          ))}
        </div>
        <Button className="mt-4" onClick={() => save("general", form)}>Save general</Button>
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
