import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, money } from "@/api/client";
import type { Order, Paginated, Wallet } from "@/types";
import { Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { ContactLinks } from "@/components/ContactLinks";
import { BalanceCard, SpentCard, StatCard } from "@/components/dashboard/StatCards";

export function ApiAccessPage() {
  const { me } = useAuth();
  const isReseller = me?.user.role === "reseller" || me?.user.role === "admin";
  const store = me?.reseller;

  return (
    <div className="space-y-5">
      <PageHeader
        title="API Developer"
        subtitle="Programmatic ordering uses the same catalog, wallet, and order systems as the dashboard."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">API access</p>
          <p className="mt-2 text-2xl font-extrabold text-brand-700">{isReseller ? "Storefront" : "Not enabled"}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Wallet</p>
          <p className="mt-2 text-2xl font-extrabold text-brand-700">{money(me?.wallet?.balance)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Role</p>
          <p className="mt-2 text-2xl font-extrabold capitalize text-brand-700">{me?.user.role}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">API keys</p>
          <p className="mt-2 text-2xl font-extrabold text-brand-700">Not issued</p>
        </Card>
      </div>
      {isReseller && store ? (
        <Card>
          <h2 className="font-bold">Your storefront</h2>
          <p className="mt-2 text-sm text-muted">Share this catalog with customers. Pricing is managed from your reseller dashboard.</p>
          <p className="mt-3 truncate rounded-xl bg-brand-50 px-3 py-2 text-sm dark:bg-slate-800">{`${window.location.origin}/store/${store.store_slug}`}</p>
          <Link to="/app/reseller"><Button className="mt-4">Open reseller dashboard</Button></Link>
        </Card>
      ) : (
        <EmptyState
          title="You haven't created an API key yet."
          body="Self-serve API keys are not enabled on this account. Use New Order in the dashboard, or contact support if you need a wholesale / child-panel setup."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/app"><Button>New Order</Button></Link>
              <Link to="/app/become-reseller"><Button variant="outline">Child panels</Button></Link>
            </div>
          }
        />
      )}
      <Card>
        <h2 className="font-bold">Need help?</h2>
        <p className="mt-1 text-sm text-muted">Talk to the team about reseller or high-volume access.</p>
        <ContactLinks className="mt-3" tone="light" />
      </Card>
    </div>
  );
}

export function LoyaltyPage() {
  const { me } = useAuth();
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api<Wallet>("/wallet") });
  const orders = useQuery({ queryKey: ["my-orders"], queryFn: () => api<Paginated<Order>>("/orders?limit=5") });
  const loading = wallet.isLoading || orders.isLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Loyalty Program"
        subtitle="Your spend, orders, and affiliate earnings stay in one place — no separate points ledger."
      />
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <SpentCard amount={wallet.data?.total_spent ?? 0} />
          <StatCard
            icon={<ShoppingCart className="h-8 w-8 text-brand-700" />}
            title={(orders.data?.total ?? 0).toLocaleString()}
            subtitle="Orders (All time)"
          />
          <BalanceCard amount={wallet.data?.available_balance ?? wallet.data?.balance ?? me?.wallet?.balance} />
        </div>
      )}
      <Card>
        <h2 className="font-bold">How it works</h2>
        <p className="mt-2 text-sm text-muted">
          Keep ordering and referring friends. Affiliate commission is paid into your wallet when referred users add funds.
          Child-panel / reseller upgrades are available from your account when enabled by admin.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/app/affiliates"><Button>Affiliate program</Button></Link>
          <Link to="/app"><Button variant="outline">Place an order</Button></Link>
        </div>
      </Card>
    </div>
  );
}
