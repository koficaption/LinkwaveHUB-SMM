import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Product } from "@/types";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { publicProductName } from "@/utils/catalog";

export function ResellerDashboard() {
  const stats = useQuery({ queryKey: ["reseller-me"], queryFn: () => api<{ reseller: Record<string, unknown>; stats: Record<string, unknown> }>("/reseller/me") });
  const s = stats.data?.stats;
  return (
    <div className="space-y-4">
      <PageHeader title="Reseller dashboard" subtitle="Store orders, sales, and profit." />
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-muted">Orders</p><p className="text-2xl font-extrabold text-brand-700">{Number(s?.orders ?? 0)}</p></Card>
        <Card><p className="text-sm text-muted">Sales</p><p className="text-2xl font-extrabold text-brand-700">{money(Number(s?.sales ?? 0))}</p></Card>
        <Card><p className="text-sm text-muted">Profit</p><p className="text-2xl font-extrabold text-brand-700">{money(Number(s?.profit ?? 0))}</p></Card>
        <Card><p className="text-sm text-muted">Today</p><p className="text-2xl font-extrabold text-brand-700">{Number(s?.today_orders ?? 0)}</p></Card>
      </div>
    </div>
  );
}

export function ResellerStorefrontPage() {
  const { me, refresh } = useAuth();
  const r = me?.reseller;
  const [storeName, setStoreName] = useState(r?.store_name ?? "");
  const [tagline, setTagline] = useState(r?.tagline ?? "");
  const [brandColor, setBrandColor] = useState(r?.brand_color ?? "#0D9488");
  const [markup, setMarkup] = useState(String(r?.markup_percent ?? 20));
  const link = r ? `${window.location.origin}/store/${r.store_slug}` : "";
  return (
    <Card className="max-w-xl">
      <h1 className="page-title">Storefront branding</h1>
      <p className="mt-1 text-sm text-slate-500">Share this link: <a className="font-semibold text-brand-700" href={link}>{link}</a></p>
      <div className="mt-4 space-y-3">
        <label className="block"><span className="label">Store name</span><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} /></label>
        <label className="block"><span className="label">Tagline</span><Input value={tagline} onChange={(e) => setTagline(e.target.value)} /></label>
        <label className="block"><span className="label">Brand color</span><Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} /></label>
        <label className="block"><span className="label">Default markup %</span><Input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} /></label>
        <Button onClick={async () => {
          try {
            await api("/reseller/storefront", { method: "PATCH", body: JSON.stringify({ storeName, tagline, brandColor, markupPercent: Number(markup) }) });
            await refresh();
            toast.success("Storefront updated");
          } catch (e) { toast.error(e instanceof ApiError ? e.message : "Failed"); }
        }}>Save branding</Button>
      </div>
    </Card>
  );
}

export function ResellerPricingPage() {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products-all"], queryFn: () => api<{ items: Product[] }>("/products?limit=100") });
  return (
    <div>
      <h1 className="page-title">Selling prices</h1>
      <p className="text-sm text-slate-500">Set a price at or above the reseller cost. Customers on your storefront see your price.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Product","Reseller cost","Your price",""].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>
            {products.data?.items.map((p) => <PriceRow key={p.id} product={p} onSaved={() => qc.invalidateQueries({ queryKey: ["products-all"] })} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceRow({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const floor = Number(product.reseller_price_per_1000 ?? product.price_per_1000);
  const [price, setPrice] = useState(String(floor));
  const save = useMutation({
    mutationFn: () => api("/reseller/prices", { method: "PUT", body: JSON.stringify({ productId: product.id, sellingPrice: Number(price), isEnabled: true }) }),
    onSuccess: () => { toast.success("Price saved"); onSaved(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
  });
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      <td className="p-3">{publicProductName(product.name)}</td>
      <td className="p-3">{money(floor)}</td>
      <td className="p-3"><Input value={price} onChange={(e) => setPrice(e.target.value)} className="max-w-32" /></td>
      <td className="p-3"><Button onClick={() => save.mutate()}>Save</Button></td>
    </tr>
  );
}
