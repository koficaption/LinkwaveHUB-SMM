import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Ticket } from "lucide-react";
import { api, formatDate, money } from "@/api/client";
import type { LoyaltyMe, LoyaltyTier, Order, Paginated, Wallet } from "@/types";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { BalanceCard, SpentCard, StatCard } from "@/components/dashboard/StatCards";
import { ApiPortalPage } from "@/pages/customer/ApiPortalPage";
import { usePublicSettings } from "@/components/ContactLinks";
import { cn } from "@/utils/cn";

export function ApiAccessPage() {
  const { me } = useAuth();
  if (me?.panel) return <Navigate to="/app" replace />;
  return <ApiPortalPage />;
}

function waLink(value?: string) {
  const n = (value || "").replace(/\D/g, "");
  return n ? `https://wa.me/${n}` : undefined;
}

function thresholdLabel(tier: LoyaltyTier) {
  return `₵${tier.minSpendGhs.toLocaleString()} / $${tier.minSpendUsd.toLocaleString()}+`;
}

function tierTheme(id: LoyaltyTier["id"]) {
  if (id === "vip") {
    return {
      card: "border-amber-300 bg-gradient-to-b from-amber-50 to-white dark:border-amber-700 dark:from-amber-950/40 dark:to-slate-900",
      kicker: "text-amber-700 dark:text-amber-400",
      title: "text-amber-900 dark:text-amber-200",
    };
  }
  if (id === "frequent") {
    return {
      card: "border-brand-200 bg-gradient-to-b from-brand-50 to-white dark:border-brand-800 dark:from-brand-950/40 dark:to-slate-900",
      kicker: "text-brand-700 dark:text-brand-400",
      title: "text-brand-900 dark:text-brand-200",
    };
  }
  return {
    card: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
    kicker: "text-slate-500",
    title: "text-slate-900 dark:text-white",
  };
}

function TierCard({
  tier,
  active,
  topTier,
}: {
  tier: LoyaltyTier;
  active: boolean;
  topTier?: boolean;
}) {
  const theme = tierTheme(tier.id);
  return (
    <Card className={cn("relative overflow-hidden border-2", theme.card, active && "ring-2 ring-brand-600 ring-offset-2 dark:ring-offset-slate-950")}>
      {topTier && (
        <p className={cn("text-xs font-extrabold uppercase tracking-[0.2em]", theme.kicker)}>Top Tier</p>
      )}
      {active && (
        <span className="absolute right-4 top-4 rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Your tier
        </span>
      )}
      <p className={cn("text-xs font-extrabold uppercase tracking-[0.18em]", theme.kicker, topTier && "mt-1")}>
        {tier.name}
      </p>
      <p className={cn("mt-2 text-2xl font-extrabold", theme.title)}>{thresholdLabel(tier)}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
        {tier.benefits.map((benefit) => (
          <li key={benefit} className="flex gap-2">
            <span aria-hidden>⭐</span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function LoyaltyPage() {
  const { me } = useAuth();
  const settings = usePublicSettings();
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api<Wallet>("/wallet") });
  const orders = useQuery({ queryKey: ["my-orders"], queryFn: () => api<Paginated<Order>>("/orders?limit=5") });
  const loyalty = useQuery({ queryKey: ["loyalty-me"], queryFn: () => api<LoyaltyMe>("/loyalty/me") });
  const loading = wallet.isLoading || orders.isLoading || loyalty.isLoading;
  const data = loyalty.data;
  const whatsapp = waLink(settings.data?.whatsappNumber);

  if (me?.panel) return <Navigate to="/app" replace />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customer Loyalty Program"
        subtitle="Spend on orders to unlock support, service discounts, a complimentary child panel, and the VIP lottery. Discounts apply to customer prices only — not reseller, API, or storefront rates."
      />
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <SpentCard amount={wallet.data?.total_spent ?? data?.spent ?? 0} />
          <StatCard
            icon={<img src="/dashboard/cart-3d.webp" alt="" className="h-[88%] w-[88%] object-contain" draggable={false} />}
            title={(orders.data?.total ?? 0).toLocaleString()}
            subtitle="Orders (All time)"
          />
          <BalanceCard amount={wallet.data?.available_balance ?? wallet.data?.balance ?? me?.wallet?.balance} />
        </div>
      )}

      {data && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Current tier</p>
              <p className="mt-1 text-2xl font-extrabold">{data.current.name}</p>
              {data.discountPercent > 0 && (
                <p className="mt-1 text-sm font-semibold text-brand-700">{data.discountPercent}% off customer service prices</p>
              )}
            </div>
            <p className="text-sm text-muted">Lifetime spend {money(data.spent)}</p>
          </div>
          {data.next ? (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs font-semibold text-muted">
                <span>{money(data.remaining)} more to {data.next.name}</span>
                <span>{data.progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${data.progressPercent}%` }} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">You are on the top tier. Keep ordering to stay eligible for the $100 monthly lottery.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/app/support"><Button variant="outline"><Ticket className="h-4 w-4" /> 24/7 tickets</Button></Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <Button variant="outline"><MessageCircle className="h-4 w-4" /> WhatsApp support</Button>
              </a>
            )}
            {data.childPanelFree && (
              <Link to="/app/child-panels"><Button>Claim free child panel</Button></Link>
            )}
            <Link to="/app"><Button variant={data.childPanelFree ? "outline" : "primary"}>Place an order</Button></Link>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {(data?.tiers ?? []).map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            active={data?.current.id === tier.id}
            topTier={tier.id === "vip"}
          />
        ))}
        {!data && !loyalty.isLoading && (
          <>
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </>
        )}
      </div>

      {data?.lastLottery?.name && (
        <Card>
          <h2 className="font-bold">Latest VIP lottery</h2>
          <p className="mt-2 text-sm text-muted">
            {data.lastLottery.name} won ${data.lastLottery.lotteryUsd ?? 100}
            {data.lastLottery.amount != null ? ` (${money(data.lastLottery.amount)})` : ""}
            {data.lastLottery.drawnAt ? ` · ${formatDate(data.lastLottery.drawnAt)}` : ""}.
          </p>
        </Card>
      )}
    </div>
  );
}
