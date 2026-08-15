import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { api, formatDate, money } from "@/api/client";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";

type AffiliateMe = {
  code: string;
  linkPath: string;
  config: { enabled: boolean; commissionPercent: number; minimumPayout: number; lifetime: boolean };
  referredCount: number;
  totalCommission: number;
  commissionCount: number;
  referrals: { id: string; full_name: string; email: string; created_at: string; deposited: string }[];
  history: { id: string; commission: string; deposit_amount: string; rate_percent: string; created_at: string; referred_name: string }[];
};

export function AffiliatePage() {
  const data = useQuery({ queryKey: ["affiliate-me"], queryFn: () => api<AffiliateMe>("/affiliates/me") });
  if (data.isLoading) return <Skeleton className="h-64" />;
  const a = data.data;
  if (!a) return <EmptyState title="Affiliates unavailable" body="Try again in a moment." />;
  const link = `${window.location.origin}${a.linkPath}`;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Earn money with affiliations</h1>
        <p className="mt-1 text-slate-500">
          Invite friends with your personal link. When they register with that link and add funds, you earn {a.config.commissionPercent}% for life on those deposits. Commission is added to your wallet and can be used to order services. Signing up with someone else’s link pays them — it does not pay you.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Commission rate</p>
          <p className="mt-2 text-3xl font-extrabold">{a.config.commissionPercent}%</p>
          <p className="text-xs text-slate-500">Lifetime on referred deposits</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Earned commission</p>
          <p className="mt-2 text-3xl font-extrabold">{money(a.totalCommission)}</p>
          <p className="text-xs text-slate-500">{a.commissionCount} payouts · min cash-out {money(a.config.minimumPayout)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Referred users</p>
          <p className="mt-2 text-3xl font-extrabold">{a.referredCount}</p>
        </Card>
      </div>
      <Card>
        <p className="text-sm font-semibold">Referral link</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 truncate rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">{link}</code>
          <Button onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Link copied"); }}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Code: {a.code}</p>
      </Card>
      <Card>
        <h2 className="font-bold">Referred users</h2>
        {!a.referrals.length && <p className="mt-3 text-sm text-slate-500">No referrals yet. Share your link to start earning.</p>}
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {a.referrals.map((r) => (
            <li key={r.id} className="flex justify-between py-2 text-sm">
              <span>{r.full_name}<span className="block text-xs text-slate-500">{r.email}</span></span>
              <span className="text-slate-500">Deposited {money(r.deposited)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-bold">Commission history</h2>
        {!a.history.length && <p className="mt-3 text-sm text-slate-500">Commissions appear when a referred user adds funds.</p>}
        <ul className="mt-3 space-y-2 text-sm">
          {a.history.map((h) => (
            <li key={h.id} className="flex justify-between">
              <span>{h.referred_name} · {h.rate_percent}%</span>
              <span className="font-semibold">{money(h.commission)} <span className="font-normal text-slate-500">{formatDate(h.created_at)}</span></span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function AffiliatesLanding() {
  const cfg = useQuery({
    queryKey: ["affiliate-public"],
    queryFn: () => api<{ commissionPercent: number; minimumPayout: number; enabled: boolean }>("/affiliates/public"),
  });
  const c = cfg.data;
  if (c && c.enabled === false) return null;
  return (
    <section id="affiliates" className="bg-white py-16 dark:bg-slate-900">
      <div className="container-page grid gap-8 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Affiliates</p>
          <h2 className="mt-2 text-2xl font-extrabold">Earn money with affiliations</h2>
          <p className="mt-3 text-slate-500">
            Invite friends with your personal link. You earn {c?.commissionPercent ?? 7}% for life of the funds they add to their wallet. Use commission to order services.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><p className="text-sm text-slate-500">Commission</p><p className="text-2xl font-extrabold">{c?.commissionPercent ?? 7}%</p></Card>
          <Card><p className="text-sm text-slate-500">For life</p><p className="text-2xl font-extrabold">Yes</p></Card>
          <Card><p className="text-sm text-slate-500">Min. payout</p><p className="text-2xl font-extrabold">{money(c?.minimumPayout ?? 10)}</p></Card>
        </div>
      </div>
    </section>
  );
}

export function AdminAffiliates() {
  const list = useQuery({ queryKey: ["admin-affiliates"], queryFn: () => api<Record<string, unknown>[]>("/admin/affiliates") });
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Affiliates</h1>
      <p className="text-sm text-slate-500">Lifetime commission on referred wallet deposits. Rate is set in Settings.</p>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["User","Code","Referrals","Commission"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={String(r.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2">{String(r.full_name)}<div className="text-xs text-slate-500">{String(r.email)}</div></td>
                <td className="p-2 font-mono">{String(r.referral_code || "—")}</td>
                <td className="p-2">{String(r.referred_count)}</td>
                <td className="p-2">{money(Number(r.total_commission))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function ReferralCapture() {
  const location = useLocation();
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref) persistReferralCode(ref);
  }, [location.search]);
  return null;
}

export function persistReferralCode(ref: string) {
  const value = ref.trim();
  if (!value) return;
  try {
    localStorage.setItem("lwh_ref", value);
    document.cookie = `lwh_ref=${encodeURIComponent(value)};path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function storedReferralCode() {
  try {
    return localStorage.getItem("lwh_ref") || undefined;
  } catch {
    return undefined;
  }
}

export async function claimStoredReferral() {
  const code = storedReferralCode();
  if (!code) return;
  try {
    await api("/affiliates/claim", { method: "POST", body: JSON.stringify({ referralCode: code }) });
  } catch {
    /* ignore if not signed in yet or code is invalid */
  }
}
