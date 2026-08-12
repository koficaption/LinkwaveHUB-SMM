import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, money } from "@/api/client";
import { Card, Select, Skeleton } from "@/components/ui";
import { useState } from "react";

const COLORS = ["#0d9488", "#6366f1", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#84cc16", "#64748b"];

export function AdminOverview() {
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Record<string, number>>("/admin/overview") });
  const [range, setRange] = useState<"today" | "7d" | "30d" | "12m">("7d");
  const revenue = useQuery({ queryKey: ["rev", range], queryFn: () => api<{ label: string; revenue: number; orders: number }[]>(`/admin/analytics/revenue?range=${range}`) });
  const statuses = useQuery({ queryKey: ["ostatus"], queryFn: () => api<{ name: string; value: number }[]>("/admin/analytics/orders") });
  const platforms = useQuery({ queryKey: ["splatform"], queryFn: () => api<{ name: string; revenue: number; orders: number }[]>("/admin/analytics/platforms") });
  const o = overview.data;
  const cards = [
    ["Total users", o?.totalUsers],
    ["Resellers", o?.totalResellers],
    ["Total orders", o?.totalOrders],
    ["Pending", o?.pendingOrders],
    ["Completed", o?.completedOrders],
    ["Failed", o?.failedOrders],
    ["Revenue", money(o?.totalRevenue ?? 0)],
    ["Profit", money(o?.totalProfit ?? 0)],
    ["Deposits", money(o?.walletDeposits ?? 0)],
    ["Today revenue", money(o?.todayRevenue ?? 0)],
    ["Today orders", o?.todayOrders],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Overview</h1>
        <p className="text-slate-500">Live statistics from your LinkWaveHub PostgreSQL database.</p>
      </div>
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40">
        <p className="font-semibold text-amber-950 dark:text-amber-100">This is your database, not someone else’s live panel</p>
        <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
          Demo Admin, Demo Customer, sample orders and the sample provider are fictional preview rows so the dashboard is not empty. Add your own products from Products. The resellersmm.com API and Korapay payments will be connected after the website is complete.
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        {cards.map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-extrabold">{value ?? 0}</p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Revenue</h2>
          <Select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="max-w-40">
            <option value="today">Today</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="12m">12 months</option>
          </Select>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenue.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold">Orders by status</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statuses.data ?? []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {(statuses.data ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">Sales by platform</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={platforms.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AdminAnalytics() {
  const products = useQuery({
    queryKey: ["prod-perf"],
    queryFn: () => api<{ mostOrdered: Record<string, unknown>[]; highestRevenue: Record<string, unknown>[]; highestProfit: Record<string, unknown>[] }>("/admin/analytics/products"),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Product performance</h1>
      {(["mostOrdered", "highestRevenue", "highestProfit"] as const).map((key) => (
        <Card key={key}>
          <h2 className="mb-3 font-bold capitalize">{key.replace(/([A-Z])/g, " $1")}</h2>
          <table className="w-full text-left text-sm">
            <thead><tr className="text-slate-500">{["Product","Orders","Revenue","Profit"].map((h) => <th key={h} className="pb-2">{h}</th>)}</tr></thead>
            <tbody>
              {(products.data?.[key] ?? []).map((p) => (
                <tr key={String(p.name)} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{String(p.name)}</td>
                  <td>{String(p.orders)}</td>
                  <td>{money(Number(p.revenue))}</td>
                  <td>{money(Number(p.profit))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
