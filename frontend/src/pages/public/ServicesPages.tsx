import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Category, Platform, Product } from "@/types";
import { Button, Card, EmptyState, Input, Pagination, Select, Skeleton } from "@/components/ui";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { useAuth } from "@/contexts/AuthContext";
import { RefillBadge } from "@/components/dashboard/RefillBadge";

export function ServicesPage({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const platform = params.get("platform") || "";
  const category = params.get("category") || "";
  const search = params.get("q") || "";
  const refill = params.get("refill") || "";
  const page = Number(params.get("page") || 1);
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });
  const categories = useQuery({
    queryKey: ["categories", platform],
    queryFn: () => api<Category[]>(`/categories${platform ? `?platformId=${platforms.data?.find((p) => p.slug === platform)?.id || platform}` : ""}`),
  });
  const products = useQuery({
    queryKey: ["products", platform, category, search, page, refill],
    queryFn: () => api<{ items: Product[]; total: number; limit: number; page: number }>(`/products?limit=24&page=${page}${platform ? `&platformId=${platform}` : ""}${category ? `&categoryId=${category}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}${refill ? `&refill=${refill}` : ""}`),
  });
  const set = (key: string, value: string) => setParams((p) => {
    if (value) p.set(key, value); else p.delete(key);
    p.set("page", "1");
    return p;
  });

  return (
    <div className={embedded ? "" : "container-page py-12"}>
      <h1 className="page-title">Services</h1>
      <p className="page-subtitle">Search the catalog. Refill is shown only when that service supports it.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <Input placeholder="Search services" defaultValue={search} onBlur={(e) => set("q", e.target.value)} />
        <Select value={platform} onChange={(e) => setParams({ platform: e.target.value, category: "", page: "1" })}>
          <option value="">All platforms</option>
          {platforms.data?.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
        </Select>
        <Select value={category} onChange={(e) => set("category", e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
        <Select value={refill} onChange={(e) => set("refill", e.target.value)}>
          <option value="">Refill: All</option>
          <option value="yes">Refill supported</option>
          <option value="no">No refill</option>
        </Select>
      </div>

      <div className="mt-6 space-y-3 lg:hidden">
        {products.isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        {products.data?.items.map((p) => (
          <Card key={p.id}>
            <p className="text-xs font-mono text-muted">#{p.provider_service_id || p.id.slice(0, 8)}</p>
            <h3 className="mt-1 font-bold">{p.name}</h3>
            <p className="mt-1 text-sm text-muted">{p.platform_name} · {p.category_name}</p>
            <p className="mt-3 text-xl font-extrabold text-brand-700">{money(p.display_price_per_1000 ?? p.price_per_1000)} <span className="text-xs font-medium text-muted">/ 1k</span></p>
            <p className="mt-1 text-sm text-muted">Min {p.min_quantity.toLocaleString()} · Max {p.max_quantity.toLocaleString()}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <RefillBadge supported={Boolean(p.refill_supported)} days={p.refill_days} />
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-emerald-800">{p.status}</span>
            </div>
            <Link to={`/services/${p.slug}`}><Button className="mt-4 w-full">View</Button></Link>
          </Card>
        ))}
      </div>

      <Card className="mt-6 hidden overflow-hidden p-0 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-brand-600 text-white">
              <tr>
                {["ID","Platform","Category","Service","Price / 1k","Min / Max","Speed","Refill","Status",""].map((h) => (
                  <th key={h} className="px-3 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.isLoading && <tr><td colSpan={10} className="p-4"><Skeleton className="h-24" /></td></tr>}
              {products.data?.items.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-mono text-xs">{p.provider_service_id || p.id.slice(0, 8)}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformIcon name={p.platform_icon} color={p.platform_color} className="h-4 w-4" />
                      {p.platform_name}
                    </span>
                  </td>
                  <td className="px-3 py-3">{p.category_name}</td>
                  <td className="px-3 py-3 font-medium">{p.name}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{money(p.display_price_per_1000 ?? p.price_per_1000)}</span></td>
                  <td className="px-3 py-3 text-xs">{p.min_quantity.toLocaleString()} / {p.max_quantity.toLocaleString()}</td>
                  <td className="px-3 py-3 text-xs">{p.avg_delivery_time || "—"}</td>
                  <td className="px-3 py-3"><RefillBadge supported={Boolean(p.refill_supported)} days={p.refill_days} /></td>
                  <td className="px-3 py-3 capitalize">{p.status}</td>
                  <td className="px-3 py-3"><Link to={`/services/${p.slug}`}><Button className="h-9 px-3">View</Button></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {products.data?.items.length === 0 && <div className="mt-6"><EmptyState title="No services found" body="Try another platform, category, or refill filter." /></div>}
      {products.data && (
        <Pagination
          page={products.data.page}
          total={products.data.total}
          limit={products.data.limit}
          onPage={(next) => setParams((p) => { p.set("page", String(next)); return p; })}
        />
      )}
    </div>
  );
}

const orderSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  target: z.string().min(3),
});

export function ServiceDetailPage() {
  const { slug } = useParams();
  const { me } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const product = useQuery({ queryKey: ["product", slug], queryFn: () => api<Product>(`/products/${slug}`) });
  const form = useForm({ resolver: zodResolver(orderSchema), defaultValues: { quantity: 100, target: "" } });
  const quantity = form.watch("quantity");
  const unit = Number(product.data?.display_price_per_1000 ?? product.data?.price_per_1000 ?? 0);
  const total = useMemo(() => (unit * Number(quantity || 0)) / 1000, [unit, quantity]);

  const mutation = useMutation({
    mutationFn: (values: { quantity: number; target: string }) =>
      api("/orders", { method: "POST", body: JSON.stringify({ productId: product.data?.id, ...values }) }),
    onSuccess: async () => {
      toast.success("Order placed successfully");
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate("/app/orders");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not place order"),
  });

  if (product.isLoading) return <div className="container-page py-16"><Skeleton className="h-80" /></div>;
  if (!product.data) return <div className="container-page py-16"><EmptyState title="Service not found" body="This product may have been disabled." /></div>;
  const p = product.data;

  return (
    <div className="container-page grid gap-8 py-12 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <p className="text-sm font-semibold text-brand-700">{p.platform_name} → {p.category_name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-extrabold">{p.name}</h1>
          <RefillBadge supported={Boolean(p.refill_supported)} days={p.refill_days} />
        </div>
        <p className="mt-4 text-slate-600 dark:text-slate-300">{p.description}</p>
        <ul className="mt-6 space-y-2 text-sm">
          {(p.features || []).map((f) => <li key={f}>• {f}</li>)}
        </ul>
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <Card>Delivery<br /><strong>{p.avg_delivery_time}</strong></Card>
          <Card>Type<br /><strong className="capitalize">{p.delivery_type}</strong></Card>
          <Card>Minimum<br /><strong>{p.min_quantity.toLocaleString()}</strong></Card>
          <Card>Maximum<br /><strong>{p.max_quantity.toLocaleString()}</strong></Card>
        </div>
      </div>
      <Card className="lg:col-span-2 h-fit">
        <h2 className="text-lg font-bold">New order</h2>
        <form className="mt-4 space-y-4" onSubmit={form.handleSubmit((v) => {
          if (!me) return navigate("/login");
          mutation.mutate(v);
        })}>
          <label className="block"><span className="label">Quantity</span><Input type="number" {...form.register("quantity")} /></label>
          <label className="block"><span className="label">Target (profile / post / link)</span><Input placeholder="https://..." {...form.register("target")} /></label>
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <p>Price: {money(unit)} / 1000</p>
            <p>Balance: {me?.wallet ? money(me.wallet.balance) : "Sign in to view"}</p>
            <p className="mt-2 text-lg font-extrabold">Total: {money(total)}</p>
          </div>
          <Button className="w-full" disabled={mutation.isPending}>{me ? "Place order" : "Login to order"}</Button>
        </form>
      </Card>
    </div>
  );
}

export function StorefrontPage() {
  const { slug } = useParams();
  const store = useQuery({
    queryKey: ["store", slug],
    queryFn: () => api<{ store: { store_name: string; tagline?: string; brand_color: string }; products: Product[] }>(`/store/${slug}`),
  });
  if (store.isLoading) return <div className="container-page py-16"><Skeleton className="h-64" /></div>;
  if (!store.data) return <EmptyState title="Store not found" body="This reseller storefront is unavailable." />;
  return (
    <div className="container-page py-12">
      <div className="rounded-3xl p-8 text-white" style={{ background: store.data.store.brand_color }}>
        <p className="text-sm uppercase tracking-wide opacity-80">Reseller storefront</p>
        <h1 className="mt-2 text-3xl font-extrabold">{store.data.store.store_name}</h1>
        <p className="mt-2 opacity-90">{store.data.store.tagline}</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {store.data.products.map((p) => (
          <Card key={p.id}>
            <p className="text-xs text-slate-500">{p.platform_name} · {p.category_name}</p>
            <h3 className="mt-2 font-bold">{p.name}</h3>
            <p className="mt-3 font-extrabold">{money(p.display_price_per_1000)} / 1000</p>
            <Link to={`/services/${p.slug}?store=${slug}`}><Button className="mt-4 w-full">Order</Button></Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
