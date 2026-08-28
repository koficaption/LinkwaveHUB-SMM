import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api, money, formatDate, ApiError } from "@/api/client";
import type { Order, Paginated, RefillRecord, Wallet } from "@/types";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Pagination, Select, Skeleton, Textarea } from "@/components/ui";
import { prettyStatus, statusTone, formatCount } from "@/utils/cn";
import { publicProductName } from "@/utils/catalog";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ContactLinks, panelHelp } from "@/components/ContactLinks";
import type { PaymentMethod } from "@/types";
import { checkoutReturnUrl, usePaystackReturn } from "@/hooks/usePaystackReturn";
import { BalanceCard, OrdersCard, SpentCard, WelcomeCard } from "@/components/dashboard/StatCards";
import { WaveDivider } from "@/components/dashboard/WaveDivider";
import { NewOrderPanel } from "@/components/dashboard/NewOrderPanel";
import { MobileActionButtons } from "@/components/dashboard/AccountMenu";
import { RefillBadge } from "@/components/dashboard/RefillBadge";
import { RequestRefillDialog } from "@/components/dashboard/RequestRefillDialog";
import { quoteKorapayFees } from "@/utils/korapayFees";
import { convertGhsToKorapay, filterKorapayMarkets, pickKorapayMarket, storeKorapayCurrency } from "@/utils/korapayMarkets";
import { getDisplayCurrency } from "@/utils/currency";

function isCardMethod(adapter?: string) {
  return adapter === "korapay" || adapter === "paystack" || adapter === "card";
}

async function copyText(value: string, label = "Copied") {
  await navigator.clipboard.writeText(value);
  toast.success(label);
}

function UniquePaymentCode({ code }: { code?: string | null }) {
  if (!code) return null;
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Your unique payment code</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-2xl font-extrabold tracking-wider text-slate-900 dark:text-white">{code}</p>
        <Button type="button" variant="outline" onClick={() => void copyText(code, "Payment code copied")}>Copy</Button>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Put this code in the Mobile Money or bank transfer note. Admin uses it to credit your wallet.
      </p>
    </div>
  );
}

function ManualPaymentDetails({
  cfg,
  amountHint,
}: {
  cfg?: PaymentMethod["config"];
  amountHint?: string;
}) {
  if (!cfg) return null;
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <p className="font-semibold text-slate-800 dark:text-slate-100">Payment details</p>
      {amountHint && <p className="mt-1">Send {amountHint}.</p>}
      {cfg.network && cfg.momoNumber && (
        <p className="mt-1">
          {cfg.network}: <strong className="font-mono">{cfg.momoNumber}</strong>
          <button type="button" className="ml-2 text-xs font-semibold text-brand-700" onClick={() => void copyText(String(cfg.momoNumber), "Number copied")}>Copy</button>
        </p>
      )}
      {cfg.accountName && <p>Name: <strong>{cfg.accountName}</strong></p>}
      {(cfg.bankName || cfg.accountNumber) && (
        <p>
          Bank: {[cfg.bankName, cfg.accountNumber].filter(Boolean).join(" · ")}
          {cfg.accountNumber ? (
            <button type="button" className="ml-2 text-xs font-semibold text-brand-700" onClick={() => void copyText(String(cfg.accountNumber), "Account copied")}>Copy</button>
          ) : null}
        </p>
      )}
      {cfg.instructions && <p className="mt-1">{cfg.instructions}</p>}
    </div>
  );
}

export function CustomerHome() {
  const { me } = useAuth();
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api<Wallet>("/wallet") });
  const orders = useQuery({ queryKey: ["my-orders-home"], queryFn: () => api<Paginated<Order>>("/orders?limit=100") });
  const displayName = (me?.user.full_name || "").trim() || "there";
  const todayOrders = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (orders.data?.items ?? []).filter((o) => new Date(o.created_at) >= start).length;
  }, [orders.data?.items]);
  const spent = wallet.data?.total_spent ?? me?.wallet?.total_spent ?? 0;
  const balance = wallet.data?.available_balance ?? wallet.data?.balance ?? me?.wallet?.balance ?? 0;
  const loading = !me || wallet.isLoading || orders.isLoading;

  return (
    <div className="space-y-6">
      <MobileActionButtons />
      {me?.panel && (
        <div className="rounded-2xl px-4 py-3 text-sm text-white" style={{ background: me.panel.brand_color }}>
          You’re ordering on <strong>{me.panel.store_name}</strong>. Prices shown are this reseller’s panel prices.
        </div>
      )}
      <div className="grid gap-4 [perspective:1000px] lg:grid-cols-4">
        <WelcomeCard
          name={displayName}
          gender={me?.user.gender}
          verified={me?.user.status === "active"}
          loading={loading}
        />
        <SpentCard amount={spent} loading={loading} />
        <OrdersCard count={todayOrders} loading={loading} />
        <BalanceCard amount={balance} loading={loading} />
      </div>
      {me?.user && !me.user.gender && (
        <p className="text-sm text-slate-500">
          Choose Male or Female in{" "}
          <Link className="font-semibold text-brand-700" to="/app/profile">Account</Link>{" "}
          so your welcome avatar matches you.
        </p>
      )}
      <WaveDivider />
      <NewOrderPanel />
    </div>
  );
}

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [refill, setRefill] = useState("");
  const orders = useQuery({
    queryKey: ["my-orders", page, status, search, refill],
    queryFn: () => api<Paginated<Order>>(`/orders?page=${page}&status=${status}&search=${encodeURIComponent(search)}&refill=${refill}`),
    refetchInterval: 20_000,
  });
  return (
    <div>
      <PageHeader title="Orders" subtitle="Track every boost you have placed. Refill appears only when that service supports it." />
      <div className="mt-4 flex flex-wrap gap-3">
        <Input placeholder="Search order ID or target" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {["pending","processing","in_progress","completed","partial","cancelled","refunded","failed"].map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </Select>
        <Select value={refill} onChange={(e) => { setRefill(e.target.value); setPage(1); }}>
          <option value="">Refill: All</option>
          <option value="available">Available</option>
          <option value="supported">Supported</option>
          <option value="unsupported">Not supported</option>
          <option value="requested">Requested</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
        </Select>
      </div>
      <div className="mt-4 space-y-3 lg:hidden">
        {orders.isLoading && <Skeleton className="h-40" />}
        {!orders.isLoading && !orders.data?.items.length && (
          <EmptyState title="No orders found yet." body="Place an order from New Order or browse the catalog." action={<Link to="/app"><Button>Browse Services</Button></Link>} />
        )}
        {(orders.data?.items ?? []).map((o) => (
          <Card key={o.id}>
            <p className="font-mono text-xs text-muted">{o.public_id}</p>
            <h3 className="mt-1 font-bold">{publicProductName(o.product_name)}</h3>
            <p className="text-sm text-muted">Quantity: {o.quantity.toLocaleString()}</p>
            <p className="text-sm text-muted">Start count: {formatCount(o.start_count)} · Remaining: {formatCount(o.remains)}</p>
            <p className="text-sm text-muted">Charge: {money(o.charge)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className={statusTone[o.status]}>{prettyStatus(o.status)}</Badge>
              <RefillBadge supported={o.refill?.refillSupported} days={o.refill?.refillDays} display={o.refill?.display} />
            </div>
            <Link to={`/app/orders/${o.public_id}`}><Button className="mt-4 w-full" variant="outline">View order</Button></Link>
          </Card>
        ))}
      </div>
      <Card className="mt-4 hidden lg:block">
        <OrdersTable data={orders.data?.items ?? []} loading={orders.isLoading} />
        {orders.data && <Pagination page={page} total={orders.data.total} limit={orders.data.limit} onPage={setPage} />}
      </Card>
      <div className="mt-4 lg:hidden">
        {orders.data && <Pagination page={page} total={orders.data.total} limit={orders.data.limit} onPage={setPage} />}
      </div>
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<Order>(`/orders/${id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s && ["pending", "processing", "in_progress", "partial"].includes(s) ? 15_000 : false;
    },
  });
  const history = useQuery({
    queryKey: ["order-refills", id],
    queryFn: () => api<{ items: RefillRecord[] }>(`/orders/${id}/refills`),
    enabled: Boolean(id),
  });
  const request = useMutation({
    mutationFn: () => api(`/orders/${id}/refill`, { method: "POST" }),
    onSuccess: async () => {
      toast.success("Refill requested");
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: ["order", id] });
      await qc.invalidateQueries({ queryKey: ["order-refills", id] });
      await qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not request refill"),
  });
  if (order.isLoading) return <Skeleton className="h-64" />;
  if (!order.data) return <EmptyState title="Order not found" body="Check the order ID and try again." />;
  const o = order.data;
  const refill = o.refill;
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
          <Item label="Service" value={publicProductName(o.product_name)} />
          <Item label="Platform" value={o.platform_name} />
          <Item label="Quantity" value={o.quantity.toLocaleString()} />
          <Item label="Start count" value={formatCount(o.start_count)} />
          <Item label="Remaining" value={formatCount(o.remains)} />
          <Item label="Amount" value={money(o.charge)} />
          <Item label="Target" value={o.target} />
          <Item label="Created" value={formatDate(o.created_at)} />
          <Item label="Last updated" value={formatDate(o.updated_at)} />
        </dl>
      </Card>
      <Card>
        <h2 className="font-bold">Refill</h2>
        <div className="mt-3">
          <RefillBadge supported={refill?.refillSupported} days={refill?.refillDays} display={refill?.display} />
        </div>
        {refill?.refillSupported ? (
          <dl className="mt-4 space-y-2 text-sm">
            <Item label="Period" value={`${refill.refillDays} days`} />
            <Item label="Deadline" value={formatDate(refill.expiresAt)} />
            <Item label="Used" value={`${refill.used} / ${refill.maxRefills}`} />
            <Item label="Status" value={prettyStatus(refill.display)} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Not available for this service.</p>
        )}
        {refill?.eligible && (
          <Button className="mt-4 w-full" onClick={() => setConfirm(true)}>↻ Request refill</Button>
        )}
        {refill && !refill.eligible && refill.refillSupported && refill.reasons[0] && (
          <p className="mt-3 text-xs text-slate-500">{refill.reasons[0]}</p>
        )}
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
      <Card className="lg:col-span-2">
        <h2 className="font-bold">Refill history</h2>
        {!history.data?.items.length && <p className="mt-3 text-sm text-slate-500">No refill requests yet.</p>}
        {!!history.data?.items.length && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-500">{["Refill ID","Status","Provider ID","Requested","Completed"].map((h) => <th key={h} className="pb-2 pr-3">{h}</th>)}</tr></thead>
              <tbody>
                {history.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 font-mono text-xs">{r.public_id}</td>
                    <td className="pr-3"><Badge className={statusTone[r.status]}>{prettyStatus(r.status)}</Badge></td>
                    <td className="pr-3 font-mono text-xs">{r.provider_refill_id || "—"}</td>
                    <td className="pr-3">{formatDate(r.requested_at || r.created_at)}</td>
                    <td className="pr-3">{r.completed_at ? formatDate(r.completed_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {confirm && (
        <RequestRefillDialog
          order={o}
          open={confirm}
          pending={request.isPending}
          onClose={() => setConfirm(false)}
          onConfirm={() => request.mutate()}
        />
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="font-medium break-all">{value}</dd></div>;
}

export function OrdersTable({ data, loading }: { data: Order[]; loading?: boolean }) {
  if (loading) return <Skeleton className="h-40" />;
  if (!data.length) return <EmptyState title="No orders found yet." body="Place an order from New Order or browse the catalog." action={<Link to="/app"><Button>Browse Services</Button></Link>} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>{["Order ID","Service","Qty","Start","Remains","Amount","Status","Refill","Created",""].map((h) => <th key={h} className="pb-3 pr-4">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-3 pr-4 font-semibold">{o.public_id}</td>
              <td className="pr-4">{publicProductName(o.product_name)}</td>
              <td className="pr-4">{o.quantity.toLocaleString()}</td>
              <td className="pr-4">{formatCount(o.start_count)}</td>
              <td className="pr-4">{formatCount(o.remains)}</td>
              <td className="pr-4">{money(o.charge)}</td>
              <td className="pr-4"><Badge className={statusTone[o.status]}>{prettyStatus(o.status)}</Badge></td>
              <td className="pr-4"><RefillBadge supported={o.refill?.refillSupported} days={o.refill?.refillDays} display={o.refill?.display} /></td>
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
  const { me } = useAuth();
  const { verifying } = usePaystackReturn();
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api<Wallet>("/wallet"),
    refetchInterval: (query) => (query.state.data?.pending_deposits?.length ? 8000 : false),
  });
  const tx = useQuery({ queryKey: ["tx"], queryFn: () => api<Paginated<Record<string, unknown>>>("/wallet/transactions") });
  const methods = useQuery({ queryKey: ["pay-methods"], queryFn: () => api<PaymentMethod[]>("/payments/methods") });
  const [amount, setAmount] = useState("50");
  const [method, setMethod] = useState("");
  const [checkoutCurrency, setCheckoutCurrency] = useState("");
  const [lastInstructions, setLastInstructions] = useState("");
  const selected = methods.data?.find((m) => m.code === method)
    ?? methods.data?.find((m) => isCardMethod(m.adapter))
    ?? methods.data?.[0];
  const methodCode = method || selected?.code || "korapay";
  const korapayMarkets = filterKorapayMarkets(
    (selected?.config?.markets ?? []).map((item) => item.currency)
  );
  const selectedMarket = isCardMethod(selected?.adapter)
    ? pickKorapayMarket(korapayMarkets, checkoutCurrency || getDisplayCurrency())
    : null;
  useEffect(() => {
    if (!selectedMarket) return;
    if (checkoutCurrency !== selectedMarket.currency) setCheckoutCurrency(selectedMarket.currency);
  }, [selectedMarket?.currency]);
  const deposit = useMutation({
    mutationFn: () => api<{ instructions?: string; checkoutUrl?: string | null; depositCode?: string }>("/payments/deposit", {
      method: "POST",
      body: JSON.stringify({
        amount: Number(amount),
        methodCode,
        returnUrl: checkoutReturnUrl("/app/wallet"),
        checkoutCurrency: isCardMethod(selected?.adapter) ? (selectedMarket?.currency || checkoutCurrency) : undefined,
      }),
    }),
    onSuccess: async (data) => {
      if (data.checkoutUrl) {
        toast.success("Redirecting to Korapay…");
        window.location.assign(data.checkoutUrl);
        return;
      }
      setLastInstructions(data.instructions || "Payment submitted. Admin will confirm and credit your wallet.");
      toast.success("Submitted. Admin will confirm this payment, then it will appear in your wallet.");
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["tx"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Deposit failed"),
  });
  const w = wallet.data;
  const cfg = selected?.config ?? {};
  const depositAmount = Number(amount);
  const localAmount = selectedMarket
    ? convertGhsToKorapay(depositAmount, selectedMarket.currency)
    : depositAmount;
  const korapayQuote = isCardMethod(selected?.adapter)
    ? quoteKorapayFees(localAmount, cfg)
    : null;
  const paymentCode = w?.deposit_code || me?.user.deposit_code || "";
  const pending = w?.pending_deposits ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-3">
        <PageHeader title="Add Funds" subtitle="Pay with the details below using your unique code. Admin confirms, then the amount is added to your wallet." />
      </div>
      <Card><p className="text-sm text-slate-500">Current / available</p><p className="mt-2 text-3xl font-extrabold">{money(w?.available_balance ?? w?.balance)}</p></Card>
      <Card><p className="text-sm text-slate-500">Total deposits</p><p className="mt-2 text-3xl font-extrabold">{money(w?.total_deposits)}</p></Card>
      <Card><p className="text-sm text-slate-500">Total spent</p><p className="mt-2 text-3xl font-extrabold">{money(w?.total_spent)}</p></Card>
      <Card className="lg:col-span-1">
        <h2 className="font-bold">Add money</h2>
        <div className="mt-4 space-y-3">
          {selected?.adapter === "manual" && <UniquePaymentCode code={paymentCode} />}
          <label className="block">
            <span className="label">Amount to add (GHS)</span>
            <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <Select value={methodCode} onChange={(e) => setMethod(e.target.value)}>
            {methods.data?.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </Select>
          {isCardMethod(selected?.adapter) && selectedMarket && (
            <div className="space-y-3">
              <label className="block">
                <span className="label">Pay from</span>
                <Select
                  value={selectedMarket.currency}
                  onChange={(e) => {
                    setCheckoutCurrency(e.target.value);
                    storeKorapayCurrency(e.target.value);
                  }}
                >
                  {korapayMarkets.map((market) => (
                    <option key={market.currency} value={market.currency}>
                      {market.country} · {market.currency}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <p className="font-semibold text-slate-800 dark:text-slate-100">Automatic Korapay</p>
                <p className="mt-1">{selectedMarket.country}: {selectedMarket.methods}.</p>
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between gap-3"><dt>Wallet credit</dt><dd className="font-semibold">{money(depositAmount, "GHS")}</dd></div>
                  {korapayQuote && korapayQuote.total > korapayQuote.wallet && (
                    <>
                      <div className="flex justify-between gap-3"><dt>Korapay fee</dt><dd>{money(korapayQuote.fee, selectedMarket.currency)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>VAT / tax</dt><dd>{money(korapayQuote.vat, selectedMarket.currency)}</dd></div>
                    </>
                  )}
                  <div className="flex justify-between gap-3 border-t border-slate-200 pt-1 font-semibold dark:border-slate-700">
                    <dt>You pay</dt>
                    <dd>{money(korapayQuote?.total ?? localAmount, selectedMarket.currency)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs">
                  Korapay confirms the payment automatically and credits your wallet in GHS.
                  {selectedMarket.currency !== "GHS" ? " The local amount uses the admin USD→GHS rate." : ""}
                </p>
              </div>
            </div>
          )}
          {selected?.adapter === "manual" && (
            <ManualPaymentDetails cfg={cfg} amountHint={Number.isFinite(depositAmount) && depositAmount > 0 ? money(depositAmount) : undefined} />
          )}
          {selected?.adapter === "manual" && (
            <p className="text-xs text-slate-500">Send the money first, then tap below. Admin matches your unique code and amount, confirms, and the balance appears in your account.</p>
          )}
          <Button className="w-full" onClick={() => deposit.mutate()} disabled={deposit.isPending || verifying}>
            {verifying ? "Confirming payment…" : deposit.isPending ? "Submitting…" : isCardMethod(selected?.adapter)
              ? `Pay ${money(korapayQuote?.total ?? localAmount, selectedMarket?.currency || "GHS")} with Korapay`
              : "I have paid — submit for confirmation"}
          </Button>
          {lastInstructions && <p className="text-sm text-slate-600 dark:text-slate-300">{lastInstructions}</p>}
          {pending.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="font-semibold text-amber-900 dark:text-amber-100">Waiting for admin confirmation</p>
              {pending.map((p) => (
                <p key={p.id} className="text-slate-700 dark:text-slate-200">
                  {money(Number(p.amount))} · code <span className="font-mono font-bold">{p.deposit_code || paymentCode}</span>
                </p>
              ))}
            </div>
          )}
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
  const form = useForm({
    defaultValues: {
      fullName: me?.user.full_name ?? "",
      phone: me?.user.phone ?? "",
      whatsappNumber: me?.user.whatsapp_number ?? "",
      gender: me?.user.gender ?? "",
    },
  });
  useEffect(() => {
    if (!me?.user) return;
    form.reset({
      fullName: me.user.full_name ?? "",
      phone: me.user.phone ?? "",
      whatsappNumber: me.user.whatsapp_number ?? "",
      gender: me.user.gender ?? "",
    });
  }, [form, me?.user.id, me?.user.full_name, me?.user.phone, me?.user.whatsapp_number, me?.user.gender]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <PageHeader title="Account" subtitle="Profile, password, and child panel." />
      </div>
      <Card>
        <h2 className="font-bold">Profile</h2>
        <form className="mt-4 space-y-3" onSubmit={form.handleSubmit(async (v) => {
          try {
            if (v.gender !== "male" && v.gender !== "female") {
              toast.error("Select male or female");
              return;
            }
            await api("/auth/profile", { method: "PATCH", body: JSON.stringify({ ...v, gender: v.gender }) });
            await refresh();
            toast.success("Profile updated");
          } catch (e) { toast.error(e instanceof ApiError ? e.message : "Update failed"); }
        })}>
          <label className="block"><span className="label">Full name</span><Input {...form.register("fullName")} /></label>
          <label className="block"><span className="label">Phone</span><Input {...form.register("phone")} /></label>
          <label className="block"><span className="label">WhatsApp number</span><Input placeholder="233241112222" {...form.register("whatsappNumber")} /></label>
          <label className="block">
            <span className="label">Gender</span>
            <Select
              {...form.register("gender")}
              value={form.watch("gender")}
              onChange={(e) => form.setValue("gender", e.target.value, { shouldDirty: true })}
            >
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </label>
          <p className="text-xs text-slate-500">This switches the welcome avatar on your dashboard.</p>
          <Button>Save</Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-bold">Change password</h2>
        <PasswordForm />
      </Card>
      {!me?.panel && (
        <Card className="lg:col-span-2">
          <h2 className="font-bold">Child Panel</h2>
          <p className="mt-1 text-sm text-slate-500">Order a hosted panel on your own domain. Point it to our nameservers, then submit the form.</p>
          <Link to="/app/child-panels"><Button className="mt-3">Order child panel</Button></Link>
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
  const { me } = useAuth();
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api<Record<string, unknown>[]>("/support") });
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader title="Support Tickets" subtitle="Get help with an order or deposit." actions={<Button onClick={() => setOpen(true)}>New ticket</Button>} />
      <Card className="mt-4">
        <p className="text-sm font-semibold">Customer service</p>
        <p className="mt-1 text-sm text-slate-500">
          {me?.panel
            ? "Call or WhatsApp this store using the contacts set by the reseller."
            : "Call, WhatsApp, or join a community using the links set by the admin."}
        </p>
        <ContactLinks className="mt-3" tone="light" details={me?.panel ? panelHelp(me.panel) : undefined} />
      </Card>
      <Card className="mt-4">
        {!tickets.data?.length && <EmptyState title="No tickets yet" body="Create a ticket if you need help with an order or deposit." />}
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
      {!notes.data?.length && !notes.isLoading && <EmptyState title="You're all caught up." body="No notifications right now." />}
      <ul className="space-y-3">
        {notes.data?.map((n) => (
          <li key={String(n.id)} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <p className="font-semibold">{String(n.title)}</p>
            <p className="text-sm text-slate-500">{String(n.body)}</p>
            {n.created_at ? <p className="mt-1 text-xs text-slate-400">{formatDate(String(n.created_at))}</p> : null}
            {typeof (n.metadata as { publicId?: string } | undefined)?.publicId === "string" && (
              <Link to={`/app/orders/${(n.metadata as { publicId: string }).publicId}`} className="mt-2 inline-block text-sm font-semibold text-brand-700">
                View order
              </Link>
            )}
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
  vipComplimentary?: boolean;
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
    deposit_code?: string | null;
    payment_metadata?: { instructions?: string; checkoutUrl?: string | null };
    created_at: string;
  } | null;
};

export function BecomeResellerPage() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { verifying } = usePaystackReturn();
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
  const [checkoutCurrency, setCheckoutCurrency] = useState("");
  const [senderName, setSenderName] = useState(me?.user.full_name ?? "");
  const [senderNumber, setSenderNumber] = useState(me?.user.phone ?? "");
  const selected = methods.data?.find((m) => m.code === method)
    ?? methods.data?.find((m) => isCardMethod(m.adapter))
    ?? methods.data?.find((m) => m.adapter === "manual")
    ?? methods.data?.[0];
  const methodCode = method || selected?.code || "korapay";
  const cfg = selected?.config ?? {};
  const cardCheckout = isCardMethod(selected?.adapter);
  const korapayMarkets = filterKorapayMarkets((selected?.config?.markets ?? []).map((item) => item.currency));
  const selectedMarket = cardCheckout ? pickKorapayMarket(korapayMarkets, checkoutCurrency || getDisplayCurrency()) : null;

  useEffect(() => {
    if (me?.panel) navigate("/app", { replace: true });
    if (me?.user.role === "reseller") navigate("/app/reseller", { replace: true });
  }, [me?.panel, me?.user.role, navigate]);

  useEffect(() => {
    if (offer.data?.application?.status === "approved") {
      void refresh().then(() => navigate("/app/reseller", { replace: true }));
    }
  }, [offer.data?.application?.status, refresh, navigate]);

  const apply = useMutation({
    mutationFn: () => api<{ instructions?: string; checkoutUrl?: string | null; payment?: { checkoutUrl?: string | null } }>("/account/reseller-upgrade", {
      method: "POST",
      body: JSON.stringify({
        storeName,
        methodCode: Number(offer.data?.upgradeFee ?? 0) > 0 ? methodCode : undefined,
        senderName: Number(offer.data?.upgradeFee ?? 0) > 0 && !cardCheckout ? senderName : undefined,
        senderNumber: Number(offer.data?.upgradeFee ?? 0) > 0 && !cardCheckout ? senderNumber : undefined,
        returnUrl: checkoutReturnUrl("/app/become-reseller"),
        checkoutCurrency: cardCheckout ? (selectedMarket?.currency || checkoutCurrency) : undefined,
      }),
    }),
    onSuccess: async (data) => {
      const url = data.checkoutUrl || data.payment?.checkoutUrl;
      if (url) {
        toast.success("Redirecting to Korapay…");
        window.location.assign(url);
        return;
      }
      toast.success(data.instructions || (Number(offer.data?.upgradeFee ?? 0) === 0
        ? "Application submitted. An admin will activate your reseller dashboard."
        : "Application submitted. Pay by Mobile Money, then wait for admin confirmation."));
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
  const pendingCheckout = application?.payment_metadata?.checkoutUrl;
  const upgradeLocal = selectedMarket
    ? convertGhsToKorapay(Number(data?.upgradeFee ?? 0), selectedMarket.currency)
    : Number(data?.upgradeFee ?? 0);
  const upgradeQuote = cardCheckout
    ? quoteKorapayFees(upgradeLocal, selected?.config)
    : null;
  const paymentCode = me?.user.deposit_code || application?.deposit_code || "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Become a reseller</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pay the fee set by admin. Korapay is confirmed automatically for Ghana, Nigeria, and other enabled countries. Manual Mobile Money still waits for admin confirmation.
        </p>
      </div>
      <Card>
        <p className="text-sm text-slate-500">Upgrade fee</p>
        <p className="mt-1 text-3xl font-extrabold">{money(data?.upgradeFee ?? 0, data?.currency ?? "GHS")}</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{data?.upgradeNote}</p>
      </Card>
      {verifying && <Card><p className="text-sm">Confirming your Korapay payment…</p></Card>}
      {pending && application && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">{pendingCheckout ? "Finish card payment" : "Waiting for admin confirmation"}</h2>
            <Badge className={statusTone[application.status] ?? statusTone.pending}>{prettyStatus(application.status)}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Store: <strong>{application.store_name}</strong>
          </p>
          {!pendingCheckout && <div className="mt-3"><UniquePaymentCode code={paymentCode} /></div>}
          {instructions && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">{instructions}</p>}
          {pendingCheckout ? (
            <Button className="mt-3" onClick={() => window.location.assign(pendingCheckout)}>Continue to Korapay</Button>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Send the MoMo payment using your unique code as the note. When an admin confirms it, this page will switch to your reseller dashboard.</p>
          )}
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
          <h2 className="font-bold">{Number(data.upgradeFee) === 0 ? "Submit application" : "Apply and pay"}</h2>
          <div className="mt-4 space-y-3">
            <label className="block"><span className="label">Store name</span><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} /></label>
            {Number(data.upgradeFee) > 0 && (
              <>
                <label className="block">
                  <span className="label">Pay with</span>
                  <Select value={methodCode} onChange={(e) => setMethod(e.target.value)}>
                    {methods.data?.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                  </Select>
                </label>
                {cardCheckout && selectedMarket && (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="label">Pay from</span>
                      <Select
                        value={selectedMarket.currency}
                        onChange={(e) => {
                          setCheckoutCurrency(e.target.value);
                          storeKorapayCurrency(e.target.value);
                        }}
                      >
                        {korapayMarkets.map((market) => (
                          <option key={market.currency} value={market.currency}>
                            {market.country} · {market.currency}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <p>{selectedMarket.country}: {selectedMarket.methods}.</p>
                      <dl className="mt-2 space-y-1">
                        <div className="flex justify-between gap-3"><dt>Upgrade fee</dt><dd className="font-semibold">{money(data.upgradeFee, "GHS")}</dd></div>
                        {upgradeQuote && upgradeQuote.total > upgradeQuote.wallet && (
                          <>
                            <div className="flex justify-between gap-3"><dt>Korapay fee</dt><dd>{money(upgradeQuote.fee, selectedMarket.currency)}</dd></div>
                            <div className="flex justify-between gap-3"><dt>VAT / tax</dt><dd>{money(upgradeQuote.vat, selectedMarket.currency)}</dd></div>
                          </>
                        )}
                        <div className="flex justify-between gap-3 border-t border-slate-200 pt-1 font-semibold dark:border-slate-700">
                          <dt>You pay</dt>
                          <dd>{money(upgradeQuote?.total ?? upgradeLocal, selectedMarket.currency)}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-xs">After Korapay confirms, your dashboard switches to reseller automatically.</p>
                    </div>
                  </div>
                )}
                {selected?.adapter === "manual" && (
                  <>
                    <UniquePaymentCode code={paymentCode} />
                    <ManualPaymentDetails cfg={cfg} amountHint={money(data.upgradeFee, data.currency)} />
                  </>
                )}
                {selected?.adapter === "manual" && (
                  <>
                    <label className="block"><span className="label">MoMo name you will send from</span><Input value={senderName} onChange={(e) => setSenderName(e.target.value)} /></label>
                    <label className="block"><span className="label">MoMo number you will send from</span><Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} /></label>
                  </>
                )}
              </>
            )}
            <Button disabled={apply.isPending || verifying || storeName.trim().length < 2} onClick={() => apply.mutate()}>
              {apply.isPending
                ? "Submitting…"
                : Number(data.upgradeFee) === 0
                  ? "Submit application"
                  : cardCheckout
                    ? `Pay ${money(upgradeQuote?.total ?? upgradeLocal, selectedMarket?.currency || "GHS")} with Korapay`
                    : `Submit and pay ${money(data.upgradeFee, data.currency)}`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
