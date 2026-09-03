import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, BookOpen, Clipboard, FlaskConical, KeyRound,
  LayoutDashboard, Package, Settings, ShoppingCart, Wallet, Webhook,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, errorMessage, formatDate, money } from "@/api/client";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Pagination, Select, Skeleton, Textarea } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND_TAGLINE } from "@/brand";
import { cn } from "@/utils/cn";
import { publicProductName } from "@/utils/catalog";
import type { Paginated, Wallet as WalletType } from "@/types";

type Section = "overview" | "keys" | "docs" | "services" | "orders" | "wallet" | "usage" | "tester" | "webhooks" | "settings";

const NAV: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "API Overview", icon: LayoutDashboard },
  { id: "keys", label: "API Keys", icon: KeyRound },
  { id: "docs", label: "API Documentation", icon: BookOpen },
  { id: "services", label: "Services", icon: Package },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "usage", label: "Usage & Analytics", icon: Activity },
  { id: "tester", label: "API Tester", icon: FlaskConical },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "settings", label: "API Settings", icon: Settings },
];

const SCOPES = [
  { id: "services:read", label: "Read Services" },
  { id: "orders:create", label: "Create Orders" },
  { id: "orders:read", label: "View Orders" },
  { id: "orders:cancel", label: "Cancel Orders" },
  { id: "balance:read", label: "View Balance" },
];

type Developer = {
  id: string;
  status: string;
  plan: string;
  applicant_name: string;
  applicant_email: string;
  company_name?: string | null;
  website_url?: string | null;
  intended_usage?: string | null;
  expected_monthly_requests?: number | null;
  rate_limit_per_minute: number;
  allowed_ips: string[];
  created_at: string;
};

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  permissions: string[];
  last_used_at?: string | null;
  created_at: string;
  secret?: string;
};

type ApiService = {
  id: string;
  platform: string;
  category: string;
  name: string;
  description?: string | null;
  min: number;
  max: number;
  price: number;
  price_unit?: "per_1000" | "each";
  delivery?: string | null;
  status: string;
};

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        toast.success("Copied");
      }}
    >
      <Clipboard className="mr-1 inline h-3 w-3" /> Copy
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-emerald-100"><code>{code}</code></pre>
      <div className="absolute right-2 top-2"><CopyButton value={code} /></div>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "approved" || status === "active" || status === "delivered") return "bg-emerald-50 text-emerald-800";
  if (status === "pending") return "bg-amber-50 text-amber-800";
  if (status === "suspended" || status === "revoked" || status === "rejected" || status === "failed") return "bg-rose-50 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

export function ApiPortalPage() {
  const [section, setSection] = useState<Section>("overview");
  const me = useQuery({ queryKey: ["api-developer-me"], queryFn: () => api<{ developer: Developer | null; usage: Record<string, number> | null; settings: Record<string, number | boolean> }>("/developer/me") });

  return (
    <div className="space-y-5">
      <BrandLogo variant="full" withLink={false} />
      <PageHeader
        title="API Developer Portal"
        subtitle={`Connect your website to LinkBoost Growth SMM. Same catalog, wallet, and providers as the dashboard. ${BRAND_TAGLINE}.`}
      />
      <div className="flex flex-col gap-5 lg:flex-row">
        <nav className="flex gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold",
                  section === item.id ? "bg-brand-600 text-white" : "bg-white text-slate-700 hover:bg-brand-50 dark:bg-slate-900 dark:text-slate-200"
                )}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1">
          {me.isLoading ? <Skeleton className="h-64" /> : (
            <>
              {section === "overview" && <Overview developer={me.data?.developer ?? null} usage={me.data?.usage ?? null} onApply={() => setSection("settings")} />}
              {section === "keys" && <KeysSection developer={me.data?.developer ?? null} />}
              {section === "docs" && <DocsSection />}
              {section === "services" && <ServicesSection />}
              {section === "orders" && <OrdersSection />}
              {section === "wallet" && <WalletSection />}
              {section === "usage" && <UsageSection />}
              {section === "tester" && <TesterSection />}
              {section === "webhooks" && <WebhooksSection developer={me.data?.developer ?? null} />}
              {section === "settings" && <SettingsSection developer={me.data?.developer ?? null} onRefresh={() => me.refetch()} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({ developer, usage, onApply }: { developer: Developer | null; usage: Record<string, number> | null; onApply: () => void }) {
  const { me } = useAuth();
  if (!developer) {
    return (
      <EmptyState
        title="Apply for API access"
        body="Approved developers can generate production keys and place orders through REST. Applications are reviewed by an administrator."
        action={<Button onClick={onApply}>Start application</Button>}
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm text-muted">Access</p><p className="mt-2 text-2xl font-extrabold capitalize text-brand-700">{developer.status}</p></Card>
        <Card><p className="text-sm text-muted">Plan</p><p className="mt-2 text-2xl font-extrabold capitalize text-brand-700">{developer.plan}</p></Card>
        <Card><p className="text-sm text-muted">Rate limit</p><p className="mt-2 text-2xl font-extrabold text-brand-700">{developer.rate_limit_per_minute}/min</p></Card>
        <Card><p className="text-sm text-muted">Wallet</p><p className="mt-2 text-2xl font-extrabold text-brand-700">{money(me?.wallet?.balance)}</p></Card>
      </div>
      {usage && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><p className="text-sm text-muted">Requests today</p><p className="mt-2 text-2xl font-extrabold">{usage.today ?? 0}</p></Card>
          <Card><p className="text-sm text-muted">This month</p><p className="mt-2 text-2xl font-extrabold">{usage.month ?? 0}</p></Card>
          <Card><p className="text-sm text-muted">API orders</p><p className="mt-2 text-2xl font-extrabold">{usage.orders ?? 0}</p></Card>
          <Card><p className="text-sm text-muted">Error rate</p><p className="mt-2 text-2xl font-extrabold">{usage.error_rate ?? 0}%</p></Card>
        </div>
      )}
      <Card>
        <h2 className="font-bold">How it works</h2>
        <p className="mt-2 text-sm text-muted">Your website → LinkBoost API (`/api/v1`) → this platform → provider → order processing. Products come from the same catalog the dashboard uses. Only services marked API available are returned.</p>
      </Card>
    </div>
  );
}

function KeysSection({ developer }: { developer: Developer | null }) {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api<ApiKey[]>("/developer/keys"), enabled: Boolean(developer) });
  const [name, setName] = useState("My Website API");
  const [permissions, setPermissions] = useState(SCOPES.map((s) => s.id));
  const [revealed, setRevealed] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api<ApiKey>("/developer/keys", { method: "POST", body: JSON.stringify({ name, permissions }) }),
    onSuccess: (data) => {
      setRevealed(data.secret ?? null);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key created. Copy the secret now — it will not be shown again.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!developer || developer.status !== "approved") {
    return <EmptyState title="Production keys require approval" body="Submit an API application and wait for an administrator to approve access before generating keys." />;
  }

  return (
    <div className="space-y-4">
      {revealed && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="font-bold text-amber-900">Save this secret now</p>
          <p className="mt-1 text-sm text-amber-800">LinkBoost never stores or displays the full API key again. If you lose it, regenerate the key.</p>
          <p className="mt-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-sm">{revealed}</p>
          <div className="mt-3"><CopyButton value={revealed} /></div>
        </Card>
      )}
      <Card>
        <h2 className="font-bold">Create API key</h2>
        <div className="mt-3 grid gap-3">
          <label className="block"><span className="label">Key name</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {SCOPES.map((scope) => (
              <label key={scope.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissions.includes(scope.id)}
                  onChange={(e) => setPermissions((current) => e.target.checked ? [...current, scope.id] : current.filter((id) => id !== scope.id))}
                />
                {scope.label}
              </label>
            ))}
          </div>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>Generate API key</Button>
        </div>
      </Card>
      <div className="space-y-3">
        {keys.data?.map((key) => (
          <Card key={key.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold">{key.name}</p>
                <p className="mt-1 font-mono text-sm text-muted">{key.key_prefix}••••</p>
                <p className="mt-1 text-xs text-muted">Created {formatDate(key.created_at)} · Last used {key.last_used_at ? formatDate(key.last_used_at) : "never"}</p>
                <div className="mt-2 flex flex-wrap gap-1">{(key.permissions ?? []).map((p) => <Badge key={p} className="bg-brand-50 text-brand-800">{SCOPES.find((s) => s.id === p)?.label ?? p}</Badge>)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className={statusTone(key.status)}>{key.status}</Badge>
                {key.status !== "revoked" && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={async () => {
                      try {
                        const next = await api<ApiKey>(`/developer/keys/${key.id}/regenerate`, { method: "POST" });
                        setRevealed(next.secret ?? null);
                        qc.invalidateQueries({ queryKey: ["api-keys"] });
                      } catch (e) { toast.error(errorMessage(e)); }
                    }}>Regenerate</Button>
                    <Button variant="danger" onClick={async () => {
                      try {
                        await api(`/developer/keys/${key.id}/revoke`, { method: "POST" });
                        qc.invalidateQueries({ queryKey: ["api-keys"] });
                        toast.success("Key revoked");
                      } catch (e) { toast.error(errorMessage(e)); }
                    }}>Revoke</Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
        {!keys.data?.length && <EmptyState title="No API keys yet" body="Create a named key for each website or integration." />}
      </div>
    </div>
  );
}

function DocsSection() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const spec = useQuery({ queryKey: ["openapi-v1"], queryFn: async () => {
    const res = await fetch("/api/v1/openapi.json");
    return res.json();
  } });
  const [lang, setLang] = useState<"curl" | "js" | "python" | "php">("curl");
  const examples = useMemo(() => ({
    curl: `curl ${origin}/api/v1/services \\\n  -H "Authorization: Bearer YOUR_API_KEY"`,
    js: `const res = await fetch("${origin}/api/v1/services", {\n  headers: { Authorization: "Bearer YOUR_API_KEY" }\n});\nconst data = await res.json();`,
    python: `import requests\nres = requests.get("${origin}/api/v1/services", headers={"Authorization": "Bearer YOUR_API_KEY"})\nprint(res.json())`,
    php: `$ch = curl_init("${origin}/api/v1/services");\ncurl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer YOUR_API_KEY"]);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\necho curl_exec($ch);`,
  }), [origin]);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold">Introduction</h2>
        <p className="mt-2 text-sm text-muted">Authenticate every request with a production API key. Base path is <code className="font-mono">/api/v1</code>. Future versions can be introduced at <code className="font-mono">/api/v2</code> without breaking v1 clients.</p>
      </Card>
      <Card>
        <h2 className="font-bold">Authentication</h2>
        <p className="mt-2 text-sm text-muted">Send the key as a bearer token or an API-Key header. Dashboard session cookies are not accepted on <code className="font-mono">/api/v1</code>.</p>
        <CodeBlock code={`Authorization: Bearer YOUR_API_KEY\nAPI-Key: YOUR_API_KEY`} />
      </Card>
      <Card>
        <div className="flex flex-wrap gap-2">
          {(["curl", "js", "python", "php"] as const).map((id) => (
            <Button key={id} variant={lang === id ? "primary" : "outline"} onClick={() => setLang(id)}>{id === "js" ? "JavaScript" : id.toUpperCase()}</Button>
          ))}
        </div>
        <div className="mt-3"><CodeBlock code={examples[lang]} /></div>
      </Card>
      {[
        ["GET", "/api/v1/services", "List active API services", `{ "success": true, "services": [{ "id": "...", "name": "Instagram Followers", "min": 100, "max": 100000, "price": 22 }] }`],
        ["GET", "/api/v1/balance", "Wallet balance", `{ "success": true, "balance": 250.50, "currency": "GHS", "status": "active" }`],
        ["POST", "/api/v1/orders", "Create order", `{ "success": true, "order": { "id": "LWH-20260813-ABC123", "service": "...", "quantity": 1000, "status": "pending" } }`],
        ["GET", "/api/v1/orders/{order_id}", "Order status", `{ "success": true, "order": { "id": "LWH-...", "status": "completed", "charge": 22 } }`],
        ["GET", "/api/v1/orders", "List orders (page, status, from, to, order_id)", `{ "success": true, "orders": [], "page": 1, "total": 0 }`],
        ["POST", "/api/v1/orders/{order_id}/cancel", "Cancel a pending order", `{ "success": true, "order": { "id": "LWH-...", "status": "cancelled" } }`],
      ].map(([method, path, title, example]) => (
        <Card key={path}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{method}</p>
          <h3 className="mt-1 font-mono text-sm font-bold">{path}</h3>
          <p className="mt-1 text-sm text-muted">{title}</p>
          <p className="mt-3 text-xs font-semibold">Response example</p>
          <CodeBlock code={String(example)} />
        </Card>
      ))}
      <Card>
        <h2 className="font-bold">Webhooks</h2>
        <p className="mt-2 text-sm text-muted">Register a HTTPS URL. LinkBoost signs the JSON body with HMAC-SHA256 using your webhook secret (`X-LinkBoost-Signature: sha256=...`). Events: order.created, order.processing, order.completed, order.partial, order.failed, order.refunded, order.cancelled.</p>
        <CodeBlock code={`{ "event": "order.completed", "order_id": "LWH-20260813-ABC123", "status": "completed" }`} />
      </Card>
      <Card>
        <h2 className="font-bold">OpenAPI</h2>
        <p className="mt-2 text-sm text-muted">Machine-readable spec: <code className="font-mono">GET /api/v1/openapi.json</code></p>
        {spec.data?.paths && (
          <ul className="mt-3 space-y-1 text-sm">
            {Object.keys(spec.data.paths).map((path) => (
              <li key={path} className="font-mono">{Object.keys(spec.data.paths[path]).join(", ").toUpperCase()} {path}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-bold">Errors</h2>
        <CodeBlock code={`{ "success": false, "error": { "code": "rate_limited", "message": "Too many requests" } }`} />
        <p className="mt-2 text-sm text-muted">HTTP 429 when you exceed your plan’s per-minute limit. HTTP 401 for invalid keys. Provider credentials are never returned.</p>
      </Card>
    </div>
  );
}

function ServicesSection() {
  const services = useQuery({ queryKey: ["api-services"], queryFn: () => api<{ items: ApiService[]; total: number }>("/developer/services") });
  return (
    <Card>
      <h2 className="font-bold">API services</h2>
      <p className="mt-1 text-sm text-muted">Only products an administrator marked as API available. Prices use the API price when set, otherwise the account-type price.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="text-muted"><th className="py-2">Service</th><th>Platform</th><th>Qty</th><th>Price</th><th>Delivery</th></tr></thead>
          <tbody>
            {services.data?.items.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2"><p className="font-semibold">{publicProductName(s.name)}</p><p className="font-mono text-xs text-muted">{s.id}</p></td>
                <td>{s.platform} · {s.category}</td>
                <td>{s.min}–{s.max}</td>
                <td>{money(s.price)} {s.price_unit === "each" ? "per 1" : "/ 1,000"}</td>
                <td>{s.delivery || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!services.data?.items.length && <p className="mt-4 text-sm text-muted">No API services are enabled yet.</p>}
    </Card>
  );
}

function OrdersSection() {
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ["api-orders", page],
    queryFn: () => api<Paginated<Record<string, string | number>>>(`/developer/orders?page=${page}&limit=20`),
  });
  return (
    <Card>
      <h2 className="font-bold">API orders</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="text-muted"><th className="py-2">Order</th><th>Service</th><th>Qty</th><th>Charge</th><th>Status</th></tr></thead>
          <tbody>
            {orders.data?.items.map((o) => (
              <tr key={String(o.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 font-mono">{String(o.public_id)}</td>
                <td>{publicProductName(String(o.product_name))}</td>
                <td>{String(o.quantity)}</td>
                <td>{money(o.charge)}</td>
                <td><Badge className={statusTone(String(o.status))}>{String(o.status)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={orders.data?.total ?? 0} limit={20} onPage={setPage} />
    </Card>
  );
}

function WalletSection() {
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api<WalletType>("/developer/wallet") });
  if (wallet.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><p className="text-sm text-muted">Balance</p><p className="mt-2 text-2xl font-extrabold text-brand-700">{money(wallet.data?.balance)}</p></Card>
      <Card><p className="text-sm text-muted">Currency</p><p className="mt-2 text-2xl font-extrabold">{wallet.data?.currency || "GHS"}</p></Card>
      <Card><p className="text-sm text-muted">Spent</p><p className="mt-2 text-2xl font-extrabold">{money(wallet.data?.total_spent)}</p></Card>
    </div>
  );
}

function UsageSection() {
  const usage = useQuery({ queryKey: ["api-usage"], queryFn: () => api<Record<string, unknown>>("/developer/usage") });
  const logs = useQuery({ queryKey: ["api-logs"], queryFn: () => api<Paginated<Record<string, string | number>>>("/developer/logs") });
  const data = usage.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total requests", data?.total],
          ["Successful", data?.successful],
          ["Failed", data?.failed],
          ["Today", data?.today],
          ["This month", data?.month],
          ["API orders", data?.orders],
          ["API revenue", money(Number(data?.revenue ?? 0))],
          ["Avg response", `${data?.avg_response_ms ?? 0}ms`],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-4"><p className="text-xs uppercase text-muted">{String(label)}</p><p className="mt-1 text-xl font-extrabold">{String(value ?? 0)}</p></Card>
        ))}
      </div>
      <Card className="h-72">
        <h2 className="mb-3 font-bold">Requests (14 days)</h2>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={(data?.series as { label: string; requests: number; errors: number }[]) ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Line type="monotone" dataKey="requests" stroke="#0d9488" strokeWidth={2} />
            <Line type="monotone" dataKey="errors" stroke="#e11d48" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card>
        <h2 className="font-bold">Request logs</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="text-muted"><th className="py-2">Request ID</th><th>Endpoint</th><th>Status</th><th>Time</th><th>IP</th><th>When</th></tr></thead>
            <tbody>
              {logs.data?.items.map((row) => (
                <tr key={String(row.request_id)} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 font-mono text-xs">{String(row.request_id)}</td>
                  <td>{String(row.method)} {String(row.path)}</td>
                  <td>{String(row.status_code)}</td>
                  <td>{String(row.duration_ms)}ms</td>
                  <td>{String(row.ip_address || "—")}</td>
                  <td>{formatDate(String(row.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TesterSection() {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/api/v1/services");
  const [body, setBody] = useState('{\n  "service": "",\n  "quantity": 1000,\n  "target": "https://instagram.com/example"\n}');
  const [key, setKey] = useState(() => (typeof window !== "undefined" ? sessionStorage.getItem("lb_api_tester_key") || "" : ""));
  const [result, setResult] = useState<{ status: number; time: number; request: string; response: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!key) {
      toast.error("Paste a production API key. It is only shown once when created.");
      return;
    }
    sessionStorage.setItem("lb_api_tester_key", key);
    const started = performance.now();
    setSending(true);
    try {
      const res = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "GET" || method === "DELETE" ? undefined : body,
      });
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep */ }
      setResult({
        status: res.status,
        time: Math.round(performance.now() - started),
        request: `${method} ${path}`,
        response: pretty,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold">API tester</h2>
        <p className="mt-1 text-sm text-muted">Sends a real request to `/api/v1` with the key you paste. The dashboard session is not used.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["GET", "POST", "PUT", "DELETE"].map((m) => <option key={m}>{m}</option>)}
          </Select>
          <Select className="sm:col-span-2" value={`${method} ${path}`} onChange={(e) => {
            const [nextMethod, ...rest] = e.target.value.split(" ");
            setMethod(nextMethod);
            setPath(rest.join(" "));
          }}>
            <option value="GET /api/v1/services">GET /api/v1/services</option>
            <option value="GET /api/v1/balance">GET /api/v1/balance</option>
            <option value="GET /api/v1/orders">GET /api/v1/orders</option>
            <option value="POST /api/v1/orders">POST /api/v1/orders</option>
          </Select>
        </div>
        <label className="mt-3 block"><span className="label">Endpoint</span><Input value={path} onChange={(e) => setPath(e.target.value)} /></label>
        <label className="mt-3 block"><span className="label">API key</span><Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="lbk_live_..." /></label>
        {method !== "GET" && <label className="mt-3 block"><span className="label">JSON body</span><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></label>}
        <Button className="mt-3" disabled={sending} onClick={send}>Send request</Button>
      </Card>
      {result && (
        <Card>
          <p className="text-sm font-semibold">{result.request}</p>
          <p className="mt-1 text-sm">HTTP {result.status} · {result.time}ms</p>
          <div className="mt-3"><CodeBlock code={result.response} /></div>
        </Card>
      )}
    </div>
  );
}

function WebhooksSection({ developer }: { developer: Developer | null }) {
  const qc = useQueryClient();
  const hooks = useQuery({ queryKey: ["api-webhooks"], queryFn: () => api<Record<string, unknown>[]>("/developer/webhooks"), enabled: developer?.status === "approved" });
  const [url, setUrl] = useState("https://example.com/webhook");
  const [secret, setSecret] = useState<string | null>(null);
  if (developer?.status !== "approved") {
    return <EmptyState title="Webhooks need approved API access" body="Once approved, you can register HTTPS endpoints for order events." />;
  }
  return (
    <div className="space-y-4">
      {secret && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="font-bold">Webhook signing secret</p>
          <p className="mt-1 text-sm">Shown once. Verify `X-LinkBoost-Signature` with HMAC-SHA256.</p>
          <p className="mt-3 break-all font-mono text-sm">{secret}</p>
          <CopyButton value={secret} />
        </Card>
      )}
      <Card>
        <h2 className="font-bold">Register webhook</h2>
        <Input className="mt-3" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button className="mt-3" onClick={async () => {
          try {
            const created = await api<{ secret: string }>("/developer/webhooks", { method: "POST", body: JSON.stringify({ url }) });
            setSecret(created.secret);
            qc.invalidateQueries({ queryKey: ["api-webhooks"] });
          } catch (e) { toast.error(errorMessage(e)); }
        }}>Save webhook</Button>
      </Card>
      {hooks.data?.map((hook) => (
        <Card key={String(hook.id)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm">{String(hook.url)}</p>
              <p className="mt-1 text-xs text-muted">Secret prefix {String(hook.secret_prefix)}•••• · {(hook.events as string[])?.join(", ")}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={async () => {
                await api(`/developer/webhooks/${hook.id}`, { method: "PATCH", body: JSON.stringify({ isEnabled: !hook.is_enabled }) });
                qc.invalidateQueries({ queryKey: ["api-webhooks"] });
              }}>{hook.is_enabled ? "Disable" : "Enable"}</Button>
              <Button variant="outline" onClick={async () => {
                const next = await api<{ secret: string }>(`/developer/webhooks/${hook.id}/rotate-secret`, { method: "POST" });
                setSecret(next.secret);
              }}>Rotate secret</Button>
              <Button variant="danger" onClick={async () => {
                await api(`/developer/webhooks/${hook.id}`, { method: "DELETE" });
                qc.invalidateQueries({ queryKey: ["api-webhooks"] });
              }}>Delete</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SettingsSection({ developer, onRefresh }: { developer: Developer | null; onRefresh: () => void }) {
  const [website, setWebsite] = useState(developer?.website_url || developer?.company_name || "");
  const [allowedIps, setAllowedIps] = useState((developer?.allowed_ips || []).join("\n"));

  if (developer && developer.status !== "rejected") {
    return (
      <div className="space-y-4">
        <Card>
          <h2 className="font-bold">Application</h2>
          <p className="mt-2 text-sm">Status: <Badge className={statusTone(developer.status)}>{developer.status}</Badge></p>
          <p className="mt-2 text-sm text-muted">Website: {developer.website_url || developer.company_name || "—"}</p>
        </Card>
        {developer.status === "approved" && (
          <Card>
            <h2 className="font-bold">IP restrictions</h2>
            <p className="mt-1 text-sm text-muted">Leave empty to allow any IP. One address per line.</p>
            <Textarea className="mt-3" value={allowedIps} onChange={(e) => setAllowedIps(e.target.value)} />
            <Button className="mt-3" onClick={async () => {
              try {
                await api("/developer/settings", { method: "PATCH", body: JSON.stringify({ allowedIps: allowedIps.split("\n").map((s) => s.trim()).filter(Boolean) }) });
                toast.success("Settings saved");
                onRefresh();
              } catch (e) { toast.error(errorMessage(e)); }
            }}>Save</Button>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card>
      <h2 className="font-bold">API access application</h2>
      <p className="mt-1 text-sm text-muted">Enter the name of your website. We use your account name and email for the rest.</p>
      <label className="mt-4 block">
        <span className="label">Name of website</span>
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. Quick Data Ghana" />
      </label>
      <Button className="mt-4" onClick={async () => {
        try {
          await api("/developer/apply", { method: "POST", body: JSON.stringify({ website: website.trim() }) });
          toast.success("Application submitted");
          onRefresh();
        } catch (e) { toast.error(errorMessage(e)); }
      }}>Submit</Button>
    </Card>
  );
}
