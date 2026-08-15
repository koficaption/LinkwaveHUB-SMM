import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { api, money, formatDate, ApiError } from "@/api/client";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui";
import { prettyStatus, statusTone } from "@/utils/cn";
import { useAuth } from "@/contexts/AuthContext";

type ChildPanelCurrency = { code: string; name: string };

type ChildPanelOrder = {
  id: string;
  public_id: string;
  domain: string;
  panel_currency: string;
  admin_username: string;
  monthly_price: number;
  currency: string;
  status: string;
  vip_complimentary?: boolean;
  expires_at?: string | null;
  created_at: string;
};

type ChildPanelOffer = {
  enabled: boolean;
  monthlyPrice: number;
  listPrice: number;
  currency: string;
  nameservers: string[];
  currencies: ChildPanelCurrency[];
  vipComplimentary?: boolean;
  orders: ChildPanelOrder[];
};

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
  toast.success("Copied");
}

export function ChildPanelsPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offer = useQuery({
    queryKey: ["child-panels"],
    queryFn: () => api<ChildPanelOffer>("/account/child-panels"),
  });
  const [domain, setDomain] = useState("");
  const [panelCurrency, setPanelCurrency] = useState("USD");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (me?.panel) navigate("/app", { replace: true });
  }, [me?.panel, navigate]);

  useEffect(() => {
    const first = offer.data?.currencies?.[0]?.code;
    if (first && !offer.data?.currencies.some((c) => c.code === panelCurrency)) {
      setPanelCurrency(first);
    }
  }, [offer.data?.currencies, panelCurrency]);

  const submit = useMutation({
    mutationFn: () =>
      api("/account/child-panels", {
        method: "POST",
        body: JSON.stringify({ domain, panelCurrency, adminUsername, adminPassword, confirmPassword }),
      }),
    onSuccess: async () => {
      toast.success("Child panel order submitted");
      setDomain("");
      setAdminUsername("");
      setAdminPassword("");
      setConfirmPassword("");
      await qc.invalidateQueries({ queryKey: ["child-panels"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      await qc.invalidateQueries({ queryKey: ["loyalty-me"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not submit child panel order"),
  });

  const data = offer.data;
  const nameservers = data?.nameservers?.length ? data.nameservers : ["nelly.ns.cloudflare.com", "skip.ns.cloudflare.com"];
  const listPrice = data?.listPrice ?? 220;

  if (me?.panel) return null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="page-title">Child Panel</h1>
        <p className="page-subtitle">Order a hosted panel on your own domain. This is not a reseller storefront on this site.</p>
      </div>

      {offer.isLoading && <Skeleton className="h-[32rem]" />}

      {data && !data.enabled && (
        <Card>
          <p className="text-sm text-slate-500">Child panel orders are turned off right now. Check back later or contact support.</p>
        </Card>
      )}

      {data?.enabled && (
        <Card>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (adminPassword !== confirmPassword) {
                toast.error("Admin password and confirm password do not match");
                return;
              }
              submit.mutate();
            }}
          >
            <label className="block">
              <span className="label">Domain</span>
              <Input className="h-12" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} autoComplete="off" />
            </label>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p>Before buying a Child Panel, point your domain to our nameservers :</p>
              <ul className="mt-3 space-y-2">
                {nameservers.map((ns) => (
                  <li key={ns} className="flex items-center justify-between gap-3 font-semibold">
                    <span className="break-all">{ns}</span>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900"
                      aria-label={`Copy ${ns}`}
                      onClick={() => void copyText(ns)}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <label className="block">
              <span className="label">Panel Currency</span>
              <div className="relative">
                <select className="input h-12 appearance-none pr-10" value={panelCurrency} onChange={(e) => setPanelCurrency(e.target.value)}>
                  {(data.currencies ?? []).map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
            </label>

            <label className="block">
              <span className="label">Admin Username</span>
              <Input className="h-12" placeholder="Username" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} autoComplete="off" />
            </label>

            <label className="block">
              <span className="label">Admin Password</span>
              <div className="flex gap-2">
                <Input
                  type="text"
                  className="h-12 flex-1"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white hover:bg-brand-800"
                  aria-label="Generate password"
                  title="Generate password"
                  onClick={() => {
                    const next = generatePassword();
                    setAdminPassword(next);
                    setConfirmPassword(next);
                  }}
                >
                  <Shuffle className="h-5 w-5" />
                </button>
              </div>
            </label>

            <label className="block">
              <span className="label">Admin Confirm Password</span>
              <Input
                type="password"
                className="h-12"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label className="block">
              <span className="label">Price per month</span>
              <Input readOnly value={money(listPrice, data.currency)} className="h-12 text-slate-500" />
            </label>

            {data.vipComplimentary && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                VIP complimentary first month: this order will not charge your wallet.
              </p>
            )}

            <Button className="h-12 w-full text-base" disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit Order"}
            </Button>
          </form>
        </Card>
      )}

      {(data?.orders.length ?? 0) > 0 && (
        <Card className="overflow-x-auto">
          <h2 className="font-bold">Your child panel orders</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                {["ID", "Domain", "Currency", "Price", "Status", "Ordered"].map((h) => (
                  <th key={h} className="p-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-mono text-xs">{o.public_id}</td>
                  <td className="p-2">{o.domain}</td>
                  <td className="p-2">{o.panel_currency}</td>
                  <td className="p-2">{o.vip_complimentary ? "VIP free" : money(o.monthly_price, o.currency)}</td>
                  <td className="p-2"><Badge className={statusTone[o.status] ?? statusTone.pending}>{prettyStatus(o.status)}</Badge></td>
                  <td className="p-2 text-xs text-slate-500">{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {me?.user.role === "customer" && (
        <p className="text-center text-sm text-slate-500">
          Need a storefront on this site instead?{" "}
          <Link to="/app/become-reseller" className="font-semibold text-brand-700">Become a reseller</Link>
        </p>
      )}
    </div>
  );
}
