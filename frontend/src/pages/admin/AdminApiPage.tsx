import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, errorMessage, formatDate, money } from "@/api/client";
import { Badge, Button, Card, Input, PageHeader, Pagination, Select, Skeleton } from "@/components/ui";
import type { Paginated } from "@/types";

type Tab = "developers" | "keys" | "requests" | "orders" | "usage" | "webhooks" | "limits" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "developers", label: "API Developers" },
  { id: "keys", label: "API Keys" },
  { id: "requests", label: "API Requests" },
  { id: "orders", label: "API Orders" },
  { id: "usage", label: "API Usage" },
  { id: "webhooks", label: "Webhooks" },
  { id: "limits", label: "Rate Limits" },
  { id: "settings", label: "API Settings" },
];

function tone(status: string) {
  if (status === "approved" || status === "active" || status === "delivered") return "bg-emerald-50 text-emerald-800";
  if (status === "pending") return "bg-amber-50 text-amber-800";
  return "bg-rose-50 text-rose-800";
}

export function AdminApiPage() {
  const [tab, setTab] = useState<Tab>("developers");
  const overview = useQuery({ queryKey: ["admin-api-overview"], queryFn: () => api<Record<string, number>>("/admin/api/overview") });
  const o = overview.data;

  return (
    <div className="space-y-5">
      <PageHeader title="API Management" subtitle="Approve developers, revoke keys, and review API orders that use the same catalog and wallet as the dashboard." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Developers", o?.developers],
          ["Pending", o?.pending],
          ["Active keys", o?.active_keys],
          ["Requests today", o?.requests_today],
          ["API orders", o?.api_orders],
          ["API revenue", money(o?.api_revenue ?? 0)],
          ["Webhooks", o?.webhooks],
          ["Approved", o?.approved],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-xs font-semibold uppercase text-muted">{label}</p>
            <p className="mt-1 text-xl font-extrabold text-brand-700">{overview.isLoading ? "—" : value ?? 0}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${tab === item.id ? "bg-brand-600 text-white" : "bg-white dark:bg-slate-900"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "developers" && <DevelopersTab />}
      {tab === "keys" && <KeysTab />}
      {tab === "requests" && <RequestsTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "usage" && <UsageTab overview={o} />}
      {tab === "webhooks" && <WebhooksTab />}
      {tab === "limits" && <LimitsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

function DevelopersTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["admin-api-devs", status, search, page],
    queryFn: () => api<Paginated<Record<string, unknown>>>(`/admin/api/developers?status=${status}&search=${encodeURIComponent(search)}&page=${page}`),
  });

  async function act(id: string, action: string) {
    try {
      await api(`/admin/api/developers/${id}/${action}`, { method: "POST" });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-api-devs"] });
      qc.invalidateQueries({ queryKey: ["admin-api-overview"] });
    } catch (e) { toast.error(errorMessage(e)); }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </Select>
      </div>
      {list.isLoading ? <Skeleton className="h-40" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead><tr className="text-muted"><th className="py-2">Developer</th><th>Plan</th><th>Limit</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.data?.items.map((row) => (
                <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-3">
                    <p className="font-semibold">{String(row.applicant_name)}</p>
                    <p className="text-xs text-muted">{String(row.user_email)} · {String(row.company_name || "—")}</p>
                    <p className="mt-1 text-xs">{String(row.intended_usage || "").slice(0, 140)}</p>
                  </td>
                  <td className="capitalize">{String(row.plan)}</td>
                  <td>{String(row.rate_limit_per_minute)}/min</td>
                  <td><Badge className={tone(String(row.status))}>{String(row.status)}</Badge></td>
                  <td className="space-x-1 whitespace-nowrap">
                    {row.status === "pending" && (
                      <>
                        <Button onClick={() => act(String(row.id), "approve")}>Approve</Button>
                        <Button variant="danger" onClick={() => act(String(row.id), "reject")}>Reject</Button>
                      </>
                    )}
                    {row.status === "approved" && <Button variant="outline" onClick={() => act(String(row.id), "suspend")}>Suspend</Button>}
                    {(row.status === "suspended" || row.status === "rejected") && <Button onClick={() => act(String(row.id), "activate")}>Activate</Button>}
                    <Button variant="outline" onClick={async () => {
                      const plan = prompt("Plan (free, reseller, premium)", String(row.plan));
                      const limit = prompt("Requests per minute", String(row.rate_limit_per_minute));
                      if (!plan && !limit) return;
                      await api(`/admin/api/developers/${row.id}`, { method: "PATCH", body: JSON.stringify({ plan: plan || undefined, rateLimitPerMinute: limit ? Number(limit) : undefined }) });
                      qc.invalidateQueries({ queryKey: ["admin-api-devs"] });
                    }}>Limits</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={list.data?.total ?? 0} limit={20} onPage={setPage} />
    </Card>
  );
}

function KeysTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const list = useQuery({
    queryKey: ["admin-api-keys", search],
    queryFn: () => api<Paginated<Record<string, unknown>>>(`/admin/api/keys?search=${encodeURIComponent(search)}`),
  });
  return (
    <Card>
      <Input className="mb-4 max-w-sm" placeholder="Search prefix or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="text-muted"><th className="py-2">Key</th><th>User</th><th>Status</th><th>Last used</th><th></th></tr></thead>
          <tbody>
            {list.data?.items.map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2"><p className="font-semibold">{String(row.name)}</p><p className="font-mono text-xs">{String(row.key_prefix)}••••</p></td>
                <td>{String(row.user_email)}</td>
                <td><Badge className={tone(String(row.status))}>{String(row.status)}</Badge></td>
                <td>{row.last_used_at ? formatDate(String(row.last_used_at)) : "never"}</td>
                <td>
                  {row.status !== "revoked" && (
                    <Button variant="danger" onClick={async () => {
                      await api(`/admin/api/keys/${row.id}/revoke`, { method: "POST" });
                      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
                      toast.success("Revoked");
                    }}>Revoke</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RequestsTab() {
  const list = useQuery({
    queryKey: ["admin-api-requests"],
    queryFn: () => api<Paginated<Record<string, unknown>>>("/admin/api/requests"),
  });
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead><tr className="text-muted"><th className="py-2">Request</th><th>Endpoint</th><th>Status</th><th>Time</th><th>User</th></tr></thead>
          <tbody>
            {list.data?.items.map((row) => (
              <tr key={String(row.request_id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 font-mono text-xs">{String(row.request_id)}</td>
                <td>{String(row.method)} {String(row.path)}</td>
                <td>{String(row.status_code)}</td>
                <td>{String(row.duration_ms)}ms</td>
                <td>{String(row.user_email || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function OrdersTab() {
  const list = useQuery({
    queryKey: ["admin-api-orders"],
    queryFn: () => api<Paginated<Record<string, unknown>>>("/admin/api/orders"),
  });
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="text-muted"><th className="py-2">Order</th><th>Customer</th><th>Service</th><th>Charge</th><th>Status</th></tr></thead>
          <tbody>
            {list.data?.items.map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 font-mono">{String(row.public_id)}</td>
                <td>{String(row.customer_email)}</td>
                <td>{String(row.product_name)}</td>
                <td>{money(row.charge as number)}</td>
                <td><Badge className={tone(String(row.status))}>{String(row.status)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UsageTab({ overview }: { overview?: Record<string, number> }) {
  const data = [
    { name: "Developers", value: overview?.developers ?? 0 },
    { name: "Keys", value: overview?.active_keys ?? 0 },
    { name: "Orders", value: overview?.api_orders ?? 0 },
    { name: "Requests today", value: overview?.requests_today ?? 0 },
  ];
  return (
    <Card className="h-80">
      <h2 className="mb-3 font-bold">API usage</h2>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="value" fill="#0d9488" radius={8} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function WebhooksTab() {
  const list = useQuery({
    queryKey: ["admin-api-webhooks"],
    queryFn: () => api<Paginated<Record<string, unknown>>>("/admin/api/webhooks"),
  });
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="text-muted"><th className="py-2">URL</th><th>User</th><th>Failed</th><th>Status</th></tr></thead>
          <tbody>
            {list.data?.items.map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 font-mono text-xs">{String(row.url)}</td>
                <td>{String(row.user_email)}</td>
                <td>{String(row.failed_deliveries)}</td>
                <td>{row.is_enabled ? "Enabled" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LimitsTab() {
  const settings = useQuery({ queryKey: ["admin-api-settings"], queryFn: () => api<Record<string, number | boolean>>("/admin/api/settings") });
  const [form, setForm] = useState<Record<string, number | boolean> | null>(null);
  const data = form ?? settings.data;
  if (!data) return <Skeleton className="h-40" />;
  return (
    <Card>
      <h2 className="font-bold">Default rate limits (requests / minute)</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block"><span className="label">Free API</span><Input type="number" value={Number(data.defaultRateLimit)} onChange={(e) => setForm({ ...data, defaultRateLimit: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Reseller API</span><Input type="number" value={Number(data.resellerRateLimit)} onChange={(e) => setForm({ ...data, resellerRateLimit: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Premium API</span><Input type="number" value={Number(data.premiumRateLimit)} onChange={(e) => setForm({ ...data, premiumRateLimit: Number(e.target.value) })} /></label>
      </div>
      <Button className="mt-4" onClick={async () => {
        await api("/admin/api/settings", { method: "PUT", body: JSON.stringify(data) });
        toast.success("Rate limits saved. Existing developers keep their current limit until you change that account.");
      }}>Save limits</Button>
    </Card>
  );
}

function SettingsTab() {
  const settings = useQuery({ queryKey: ["admin-api-settings"], queryFn: () => api<Record<string, number | boolean>>("/admin/api/settings") });
  const [form, setForm] = useState<Record<string, number | boolean> | null>(null);
  const data = form ?? settings.data;
  if (!data) return <Skeleton className="h-40" />;
  return (
    <Card>
      <h2 className="font-bold">API settings</h2>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(data.enabled)} onChange={(e) => setForm({ ...data, enabled: e.target.checked })} />
        Accept new API applications
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(data.requireHttpsWebhooks)} onChange={(e) => setForm({ ...data, requireHttpsWebhooks: e.target.checked })} />
        Require HTTPS webhook URLs
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Max keys per developer</span><Input type="number" value={Number(data.maxKeysPerDeveloper)} onChange={(e) => setForm({ ...data, maxKeysPerDeveloper: Number(e.target.value) })} /></label>
        <label className="block"><span className="label">Max webhooks per developer</span><Input type="number" value={Number(data.maxWebhooksPerDeveloper)} onChange={(e) => setForm({ ...data, maxWebhooksPerDeveloper: Number(e.target.value) })} /></label>
      </div>
      <Button className="mt-4" onClick={async () => {
        await api("/admin/api/settings", { method: "PUT", body: JSON.stringify(data) });
        toast.success("API settings saved");
      }}>Save settings</Button>
    </Card>
  );
}
