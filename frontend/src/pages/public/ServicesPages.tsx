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

export function ServicesPage() {
  const [params, setParams] = useSearchParams();
  const platform = params.get("platform") || "";
  const category = params.get("category") || "";
  const search = params.get("q") || "";
  const page = Number(params.get("page") || 1);
  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });
  const categories = useQuery({
    queryKey: ["categories", platform],
    queryFn: () => api<Category[]>(`/categories${platform ? `?platformId=${platforms.data?.find((p) => p.slug === platform)?.id || platform}` : ""}`),
  });
  const products = useQuery({
    queryKey: ["products", platform, category, search, page],
    queryFn: () => api<{ items: Product[]; total: number; limit: number; page: number }>(`/products?limit=24&page=${page}${platform ? `&platformId=${platform}` : ""}${category ? `&categoryId=${category}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-extrabold">Services marketplace</h1>
      <p className="mt-2 text-slate-500">Platform → category → product. Everything below is loaded from the database.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <Input placeholder="Search services" defaultValue={search} onBlur={(e) => setParams((p) => { p.set("q", e.target.value); p.set("page", "1"); return p; })} />
        <Select value={platform} onChange={(e) => setParams({ platform: e.target.value, category: "", page: "1" })}>
          <option value="">All platforms</option>
          {platforms.data?.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
        </Select>
        <Select value={category} onChange={(e) => setParams((p) => { p.set("category", e.target.value); p.set("page", "1"); return p; })}>
          <option value="">All categories</option>
          {categories.data?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        {products.data?.items.length === 0 && <div className="col-span-full"><EmptyState title="No services found" body="Try another platform or search term. Admins can add new products from the dashboard." /></div>}
        {products.data?.items.map((p) => (
          <Link key={p.id} to={`/services/${p.slug}`}>
            <Card className="h-full hover:border-brand-400">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <PlatformIcon name={p.platform_icon} color={p.platform_color} className="h-4 w-4" />
                {p.platform_name} · {p.category_name}
              </div>
              <h3 className="mt-3 font-bold">{p.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>
              <div className="mt-4 flex items-end justify-between">
                <p className="font-extrabold text-brand-700">{money(p.display_price_per_1000 ?? p.price_per_1000)} <span className="text-xs font-medium text-slate-500">/ 1000</span></p>
                <span className="text-xs text-slate-500">{p.avg_delivery_time}</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">Min {p.min_quantity.toLocaleString()} · Max {p.max_quantity.toLocaleString()}</p>
              <Button className="mt-4 w-full">Order</Button>
            </Card>
          </Link>
        ))}
      </div>
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
        <h1 className="mt-2 text-3xl font-extrabold">{p.name}</h1>
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
