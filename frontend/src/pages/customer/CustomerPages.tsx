import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api, money, formatDate, ApiError } from "@/api/client";
import type { Order, Paginated, Wallet } from "@/types";
import { Badge, Button, Card, EmptyState, Input, Pagination, Select, Skeleton, Textarea } from "@/components/ui";
import { prettyStatus, statusTone } from "@/utils/cn";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ContactLinks } from "@/components/ContactLinks";
import type { PaymentMethod } from "@/types";

export function CustomerHome() {
  const { me } = useAuth();
  const orders = useQuery({ queryKey: ["my-orders"], queryFn: () => api<Paginated<Order>>("/orders?limit=5") });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Hello, {me?.user.full_name.split(" ")[0]}</h1>
        <p className="text-slate-500">Manage orders, wallet and support from one place.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Wallet balance</p><p className="mt-2 text-2xl font-extrabold">{money(me?.wallet?.balance)}</p></Card>
        <Card><p className="text-sm text-slate-500">Recent orders</p><p className="mt-2 text-2xl font-extrabold">{orders.data?.total ?? 0}</p></Card>
        <Card>
          <p className="text-sm text-slate-500">Account</p>
          <p className="mt-2 text-2xl font-extrabold capitalize">{me?.user.role}</p>
        </Card>
        {me?.user.role === "customer" && (
          <Card>
            <p className="text-sm text-slate-500">Reseller / child panel</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Pay the admin-set fee by Mobile Money to upgrade. After confirmation your dashboard switches to reseller.</p>
            <Link to="/app/become-reseller" className="mt-2 inline-block text-sm font-semibold text-brand-700">Become a reseller</Link>
          </Card>
        )}
        <Card>
          <p className="text-sm text-slate-500">Affiliates</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Earn 7% for life when people you invite add funds.</p>
          <Link to="/app/affiliates" className="mt-2 inline-block text-sm font-semibold text-brand-700">Open affiliates</Link>
        </Card>
      </div>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Latest orders</h2>
          <Link to="/app/orders" className="text-sm font-semibold text-brand-700">View all</Link>
        </div>
        <OrdersTable data={orders.data?.items ?? []} loading={orders.isLoading} />
      </Card>
    </div>
  );
}

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const orders = useQuery({
    queryKey: ["my-orders", page, status, search],
    queryFn: () => api<Paginated<Order>>(`/orders?page=${page}&status=${status}&search=${encodeURIComponent(search)}`),
  });
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Orders</h1>
      <div className="mt-4 flex flex-wrap gap-3">
        <Input placeholder="Search order ID or target" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {["pending","processing","in_progress","completed","partial","cancelled","refunded","failed"].map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </Select>
      </div>
      <Card className="mt-4">
        <OrdersTable data={orders.data?.items ?? []} loading={orders.isLoading} />
        {orders.data && <Pagination page={page} total={orders.data.total} limit={orders.data.limit} onPage={setPage} />}
      </Card>
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const order = useQuery({ queryKey: ["order", id], queryFn: () => api<Order>(`/orders/${id}`) });
  if (order.isLoading) return <Skeleton className="h-64" />;
  if (!order.data) return <EmptyState title="Order not found" body="Check the order ID and try again." />;
  const o = order.data;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">Order ID</p>
            <h1 className="text-2xl font-extrabold">{o.public_id}</h1>
          </div>
          <Badge className={statusTone[o.status]}>{prettyStatus(o.status)}</Badge>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 text-sm">
          <Item label="Service" value={o.product_name} />
          <Item label="Platform" value={o.platform_name} />
          <Item label="Quantity" value={o.quantity.toLocaleString()} />
          <Item label="Amount" value={money(o.charge)} />
          <Item label="Target" value={o.target} />
          <Item label="Created" value={formatDate(o.created_at)} />
          <Item label="Last updated" value={formatDate(o.updated_at)} />
        </dl>
      </Card>
      <Card>
        <h2 className="font-bold">Status timeline</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {(o.history ?? []).map((h) => (
            <li key={h.id} className="border-l-2 border-brand-500 pl-3">
              <p className="font-semibold">{prettyStatus(h.to_status)}</p>
              <p className="text-slate-500">{formatDate(h.created_at)}</p>
              {h.note && <p>{h.note}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="font-medium break-all">{value}</dd></div>;
}

export function OrdersTable({ data, loading }: { data: Order[]; loading?: boolean }) {
  if (loading) return <Skeleton className="h-40" />;
  if (!data.length) return <EmptyState title="No orders yet" body="Place an order from the marketplace to see it here." action={<Link to="/services"><Button>Browse services</Button></Link>} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>{["Order ID","Service","Qty","Amount","Status","Created",""].map((h) => <th key={h} className="pb-3 pr-4">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-3 pr-4 font-semibold">{o.public_id}</td>
              <td className="pr-4">{o.product_name}</td>
              <td className="pr-4">{o.quantity.toLocaleString()}</td>
              <td className="pr-4">{money(o.charge)}</td>
              <td className="pr-4"><Badge className={statusTone[o.status]}>{prettyStatus(o.status)}</Badge></td>
              <td className="pr-4 text-slate-500">{formatDate(o.created_at)}</td>
              <td><Link to={`/app/orders/${o.public_id}`} className="font-semibold text-brand-700">View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WalletPage() {
  const qc = useQueryClient();
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api<Wallet>("/wallet") });
  const tx = useQuery({ queryKey: ["tx"], queryFn: () => api<Paginated<Record<string, unknown>>>("/wallet/transactions") });
  const methods = useQuery({ queryKey: ["pay-methods"], queryFn: () => api<PaymentMethod[]>("/payments/methods") });
  const [amount, setAmount] = useState("50");
  const [method, setMethod] = useState("");
  const [lastInstructions, setLastInstructions] = useState("");
  const selected = methods.data?.find((m) => m.code === method) ?? methods.data?.[0];
  const methodCode = method || selected?.code || "mock";
  const deposit = useMutation({
    mutationFn: () => api<{ instructions?: string }>("/payments/deposit", { method: "POST", body: JSON.stringify({ amount: Number(amount), methodCode }) }),
    onSuccess: async (data) => {
      setLastInstructions(data.instructions || "Deposit initiated");
      toast.success(data.instructions || "Deposit initiated");
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["tx"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Deposit failed"),
  });
  const w = wallet.data;
  const cfg = selected?.config ?? {};
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><p className="text-sm text-slate-500">Current / available</p><p className="mt-2 text-3xl font-extrabold">{money(w?.available_balance ?? w?.balance)}</p></Card>
      <Card><p className="text-sm text-slate-500">Total deposits</p><p className="mt-2 text-3xl font-extrabold">{money(w?.total_deposits)}</p></Card>
      <Card><p className="text-sm text-slate-500">Total spent</p><p className="mt-2 text-3xl font-extrabold">{money(w?.total_spent)}</p></Card>
      <Card className="lg:col-span-1">
        <h2 className="font-bold">Add money</h2>
        <div className="mt-4 space-y-3">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select value={methodCode} onChange={(e) => setMethod(e.target.value)}>
            {methods.data?.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </Select>
          {selected?.adapter === "manual" && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {cfg.network && cfg.momoNumber && <p>{cfg.network}: <strong>{cfg.momoNumber}</strong></p>}
              {cfg.accountName && <p>Name: {cfg.accountName}</p>}
              {cfg.bankName && <p>Bank: {cfg.bankName} {cfg.accountNumber}</p>}
              {cfg.instructions && <p className="mt-1">{cfg.instructions}</p>}
              <p className="mt-1 text-xs">After you pay, an admin confirms the deposit.</p>
            </div>
          )}
          <Button className="w-full" onClick={() => deposit.mutate()} disabled={deposit.isPending}>Deposit</Button>
          {lastInstructions && <p className="text-sm text-slate-600 dark:text-slate-300">{lastInstructions}</p>}
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="font-bold">Transactions</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-slate-500">{["Type","Amount","Balance","Date"].map((h) => <th key={h} className="pb-2">{h}</th>)}</tr></thead>
            <tbody>
              {(tx.data?.items ?? []).map((t) => (
                <tr key={String(t.id)} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{prettyStatus(String(t.type))}</td>
                  <td className={Number(t.amount) < 0 ? "text-rose-600" : "text-emerald-600"}>{money(Number(t.amount))}</td>
                  <td>{money(Number(t.balance_after))}</td>
                  <td>{formatDate(String(t.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const { me, refresh } = useAuth();
  const form = useForm({ defaultValues: { fullName: me?.user.full_name ?? "", phone: me?.user.phone ?? "" } });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="font-bold">Profile</h2>
        <form className="mt-4 space-y-3" onSubmit={form.handleSubmit(async (v) => {
          try {
            await api("/auth/profile", { method: "PATCH", body: JSON.stringify(v) });
            await refresh();
            toast.success("Profile updated");
          } catch (e) { toast.error(e instanceof ApiError ? e.message : "Update failed"); }
        })}>
          <label className="block"><span className="label">Full name</span><Input {...form.register("fullName")} /></label>
          <label className="block"><span className="label">Phone</span><Input {...form.register("phone")} /></label>
          <Button>Save</Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-bold">Change password</h2>
        <PasswordForm />
      </Card>
      {me?.user.role === "customer" && (
        <Card className="lg:col-span-2">
          <h2 className="font-bold">Become a reseller / child panel</h2>
          <p className="mt-1 text-sm text-slate-500">Pay the upgrade fee by Mobile Money. After an admin confirms payment, your dashboard switches to reseller.</p>
          <Link to="/app/become-reseller"><Button className="mt-3">Start upgrade</Button></Link>
        </Card>
      )}
    </div>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  return (
    <form className="mt-4 space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await api("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
        toast.success("Password changed");
        setCurrent(""); setNew("");
      } catch (err) { toast.error(err instanceof ApiError ? err.message : "Failed"); }
    }}>
      <label className="block"><span className="label">Current password</span><Input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="block"><span className="label">New password</span><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></label>
      <Button>Update password</Button>
    </form>
  );
}

export function SupportPage() {
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api<Record<string, unknown>[]>("/support") });
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Support</h1>
        <Button onClick={() => setOpen(true)}>New ticket</Button>
      </div>
      <Card className="mt-4">
        <p className="text-sm font-semibold">Customer service</p>
        <p className="mt-1 text-sm text-slate-500">Call, WhatsApp, or join a community using the links set by the admin.</p>
        <ContactLinks className="mt-3" />
      </Card>
      <Card className="mt-4">
        {!tickets.data?.length && <EmptyState title="No tickets" body="Create a ticket if you need help with an order or deposit." />}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {tickets.data?.map((t) => (
            <li key={String(t.id)} className="flex items-center justify-between py-3">
              <div>
                <p className="font-semibold">{String(t.subject)}</p>
                <p className="text-sm text-slate-500">{String(t.public_id)} · {String(t.category)}</p>
              </div>
              <Badge className={statusTone[String(t.status)]}>{prettyStatus(String(t.status))}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      {open && <TicketModal onClose={() => setOpen(false)} onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tickets"] }); }} />}
    </div>
  );
}

function TicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("orders");
  const [message, setMessage] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-lg">
        <h2 className="font-bold">Create ticket</h2>
        <div className="mt-4 space-y-3">
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {["orders","billing","account","technical","general"].map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Textarea placeholder="How can we help?" value={message} onChange={(e) => setMessage(e.target.value)} />
          <Button onClick={async () => {
            try {
              await api("/support", { method: "POST", body: JSON.stringify({ subject, category, message }) });
              toast.success("Ticket created");
              onCreated();
            } catch (e) { toast.error(e instanceof ApiError ? e.message : "Failed"); }
          }}>Submit</Button>
        </div>
      </Card>
    </div>
  );
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const notes = useQuery({ queryKey: ["notifications"], queryFn: () => api<Record<string, unknown>[]>("/notifications") });
  return (
    <Card>
      <div className="mb-4 flex justify-between">
        <h1 className="text-xl font-extrabold">Notifications</h1>
        <Button variant="outline" onClick={async () => { await api("/notifications/read-all", { method: "POST" }); qc.invalidateQueries({ queryKey: ["notifications"] }); }}>Mark all read</Button>
      </div>
      <ul className="space-y-3">
        {notes.data?.map((n) => (
          <li key={String(n.id)} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <p className="font-semibold">{String(n.title)}</p>
            <p className="text-sm text-slate-500">{String(n.body)}</p>
            {n.created_at ? <p className="mt-1 text-xs text-slate-400">{formatDate(String(n.created_at))}</p> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type UpgradeOffer = {
  upgradeEnabled: boolean;
  upgradeFee: number;
  upgradeNote: string;
  currency: string;
  role: string;
  reseller: { id: string; status: string; store_name: string; store_slug: string } | null;
  application: {
    id: string;
    store_name: string;
    fee_amount: number | string;
    currency: string;
    status: string;
    sender_name?: string | null;
    sender_number?: string | null;
    payment_reference?: string | null;
    payment_status?: string | null;
    method_name?: string | null;
    payment_metadata?: { instructions?: string };
    created_at: string;
  } | null;
};

export function BecomeResellerPage() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offer = useQuery({
    queryKey: ["reseller-upgrade"],
    queryFn: () => api<UpgradeOffer>("/account/reseller-upgrade"),
    refetchInterval: (query) => {
      const status = query.state.data?.application?.status;
      return status === "pending_review" || status === "pending_payment" ? 8000 : false;
    },
  });
  const methods = useQuery({ queryKey: ["pay-methods"], queryFn: () => api<PaymentMethod[]>("/payments/methods") });
  const [storeName, setStoreName] = useState(me?.user.full_name ? `${me.user.full_name}'s Store` : "");
  const [method, setMethod] = useState("");
  const [senderName, setSenderName] = useState(me?.user.full_name ?? "");
  const [senderNumber, setSenderNumber] = useState(me?.user.phone ?? "");
  const selected = methods.data?.find((m) => m.code === method) ?? methods.data?.find((m) => m.adapter === "manual") ?? methods.data?.[0];
  const methodCode = method || selected?.code || "momo";
  const cfg = selected?.config ?? {};

  useEffect(() => {
    if (me?.user.role === "reseller") navigate("/app/reseller", { replace: true });
  }, [me?.user.role, navigate]);

  useEffect(() => {
    if (offer.data?.application?.status === "approved") {
      void refresh().then(() => navigate("/app/reseller", { replace: true }));
    }
  }, [offer.data?.application?.status, refresh, navigate]);

  const apply = useMutation({
    mutationFn: () => api<{ instructions?: string }>("/account/reseller-upgrade", {
      method: "POST",
      body: JSON.stringify({
        storeName,
        methodCode,
        senderName,
        senderNumber,
      }),
    }),
    onSuccess: async (data) => {
      toast.success(data.instructions || "Application submitted. Pay by Mobile Money, then wait for admin confirmation.");
      await qc.invalidateQueries({ queryKey: ["reseller-upgrade"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not submit application"),
  });

  const data = offer.data;
  const application = data?.application;
  const pending = application?.status === "pending_review" || application?.status === "pending_payment";
  const instructions = application?.payment_metadata?.instructions;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Become a reseller / child panel</h1>
        <p className="mt-1 text-sm text-slate-500">Pay the fee set by admin. After Mobile Money is confirmed, your customer dashboard switches to reseller.</p>
      </div>
      <Card>
        <p className="text-sm text-slate-500">Upgrade fee</p>
        <p className="mt-1 text-3xl font-extrabold">{money(data?.upgradeFee ?? 0, data?.currency ?? "GHS")}</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{data?.upgradeNote}</p>
      </Card>
      {pending && application && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">Waiting for admin confirmation</h2>
            <Badge className={statusTone[application.status] ?? statusTone.pending}>{prettyStatus(application.status)}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Store: <strong>{application.store_name}</strong>
            {application.payment_reference ? <> · Reference <span className="font-mono">{application.payment_reference}</span></> : null}
          </p>
          {instructions && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">{instructions}</p>}
          <p className="mt-3 text-sm text-slate-500">Send the MoMo payment using that reference. When an admin confirms it, this page will switch to your reseller dashboard.</p>
        </Card>
      )}
      {application?.status === "rejected" && (
        <Card>
          <p className="font-semibold text-rose-700">Previous application was declined.</p>
          <p className="mt-1 text-sm text-slate-500">You can submit again after paying the current fee.</p>
        </Card>
      )}
      {data && !data.upgradeEnabled && <p className="text-sm text-slate-500">Reseller upgrades are turned off in admin settings.</p>}
      {data?.upgradeEnabled && !pending && me?.user.role === "customer" && (
        <Card>
          <h2 className="font-bold">Apply and pay</h2>
          <div className="mt-4 space-y-3">
            <label className="block"><span className="label">Store / child panel name</span><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} /></label>
            <label className="block">
              <span className="label">Pay with</span>
              <Select value={methodCode} onChange={(e) => setMethod(e.target.value)}>
                {methods.data?.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
              </Select>
            </label>
            {selected?.adapter === "manual" && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {cfg.network && cfg.momoNumber && <p>{cfg.network}: <strong>{cfg.momoNumber}</strong></p>}
                {cfg.accountName && <p>Name: {cfg.accountName}</p>}
                {cfg.bankName && <p>Bank: {cfg.bankName} {cfg.accountNumber}</p>}
                {cfg.instructions && <p className="mt-1">{cfg.instructions}</p>}
                <p className="mt-1 text-xs">Pay {money(data.upgradeFee, data.currency)} and use the payment reference as the MoMo note.</p>
              </div>
            )}
            <label className="block"><span className="label">MoMo name you will send from</span><Input value={senderName} onChange={(e) => setSenderName(e.target.value)} /></label>
            <label className="block"><span className="label">MoMo number you will send from</span><Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} /></label>
            <Button disabled={apply.isPending || storeName.trim().length < 2} onClick={() => apply.mutate()}>
              {apply.isPending ? "Submitting…" : `Submit and pay ${money(data.upgradeFee, data.currency)}`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
