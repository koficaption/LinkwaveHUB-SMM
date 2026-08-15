import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Order, Paginated, Wallet } from "@/types";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { BalanceCard, SpentCard, StatCard } from "@/components/dashboard/StatCards";
import { ApiPortalPage } from "@/pages/customer/ApiPortalPage";

export function ApiAccessPage() {
  return <ApiPortalPage />;
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
            icon={<img src="/dashboard/cart-3d.webp" alt="" className="h-[88%] w-[88%] object-contain" draggable={false} />}
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
