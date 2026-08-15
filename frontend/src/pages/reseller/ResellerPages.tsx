import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useParams } from "react-router-dom";
import { api, money, formatDate, ApiError } from "@/api/client";
import type { Product } from "@/types";
import { Button, Card, EmptyState, Input, PageHeader, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { publicProductName, isEachPrice, priceUnitSuffix } from "@/utils/catalog";

export function ResellerDashboard() {
  const stats = useQuery({ queryKey: ["reseller-me"], queryFn: () => api<{ reseller: Record<string, unknown>; stats: Record<string, unknown> }>("/reseller/me") });
  const s = stats.data?.stats;
  const r = stats.data?.reseller;
  const link = r?.store_slug ? `${window.location.origin}/store/${r.store_slug}` : "";
  return (
    <div className="space-y-4">
      <PageHeader title="Reseller dashboard" subtitle="Your customers, store orders, sales, and profit." />
      <div className="grid gap-4 md:grid-cols-5">
        <Card><p className="text-sm text-muted">Customers</p><p className="text-2xl font-extrabold text-brand-700">{Number(s?.customers ?? 0)}</p></Card>
        <Card><p className="text-sm text-muted">Orders</p><p className="text-2xl font-extrabold text-brand-700">{Number(s?.orders ?? 0)}</p></Card>
        <Card><p className="text-sm text-muted">Sales</p><p className="text-2xl font-extrabold text-brand-700">{money(Number(s?.sales ?? 0))}</p></Card>
        <Card><p className="text-sm text-muted">Profit</p><p className="text-2xl font-extrabold text-brand-700">{money(Number(s?.profit ?? 0))}</p></Card>
        <Card><p className="text-sm text-muted">Today</p><p className="text-2xl font-extrabold text-brand-700">{Number(s?.today_orders ?? 0)}</p></Card>
      </div>
      {link && (
        <Card>
          <p className="font-semibold">Your customer storefront</p>
          <p className="mt-1 text-sm text-slate-500">Share this link so people register as <strong>your</strong> customers. They log in to your panel and see your services and prices — not the main marketplace.</p>
          <a className="mt-2 inline-block break-all font-semibold text-brand-700" href={link}>{link}</a>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/reseller/customers"><Button variant="outline">Manage customers</Button></Link>
            <Link to="/app/reseller/storefront"><Button variant="outline">Edit storefront</Button></Link>
          </div>
        </Card>
      )}
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
      <p className="mt-1 text-sm text-slate-500">
        Share this link with buyers. Anyone who registers here becomes <strong>your</strong> customer and sees your prices in your panel.
      </p>
      <p className="mt-2 text-sm text-slate-500">Share this link: <a className="font-semibold text-brand-700" href={link}>{link}</a></p>
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
  const products = useQuery({ queryKey: ["products-all"], queryFn: () => api<{ items: Product[]; total: number }>("/products?limit=2000") });
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
      <td className="p-3 whitespace-nowrap">{money(floor)} {priceUnitSuffix(product)}</td>
      <td className="p-3"><Input value={price} onChange={(e) => setPrice(e.target.value)} className="max-w-32" aria-label={isEachPrice(product) ? "Price per 1" : "Price per 1,000"} /></td>
      <td className="p-3"><Button onClick={() => save.mutate()}>Save</Button></td>
    </tr>
  );
}

type ResellerCustomer = {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  status: string;
  created_at: string;
  last_login_at?: string | null;
  balance: number | string;
  order_count: number | string;
  spent: number | string;
};

export function ResellerCustomersPage() {
  const customers = useQuery({
    queryKey: ["reseller-customers"],
    queryFn: () => api<ResellerCustomer[]>("/reseller/customers"),
  });
  return (
    <div>
      <PageHeader title="Your customers" subtitle="People who registered through your storefront. They log in to your panel and pay your prices." />
      {customers.isLoading && <Skeleton className="mt-4 h-48" />}
      {!customers.isLoading && !customers.data?.length && (
        <EmptyState title="No customers yet" body="Share your storefront link. New signups from that link appear here." />
      )}
      {!!customers.data?.length && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                {["Customer", "Email", "Balance", "Orders", "Spent", "Joined", ""].map((h) => <th key={h} className="p-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {customers.data.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3 font-semibold">{c.full_name}</td>
                  <td className="p-3">{c.email}</td>
                  <td className="p-3 whitespace-nowrap">{money(Number(c.balance))}</td>
                  <td className="p-3">{Number(c.order_count)}</td>
                  <td className="p-3 whitespace-nowrap">{money(Number(c.spent))}</td>
                  <td className="p-3 whitespace-nowrap">{formatDate(c.created_at)}</td>
                  <td className="p-3">
                    <Link to={`/app/reseller/customers/${c.id}`}><Button variant="outline">View</Button></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ResellerCustomerDetailPage() {
  const { id } = useParams();
  const detail = useQuery({
    queryKey: ["reseller-customer", id],
    queryFn: () => api<{
      customer: ResellerCustomer;
      orders: { public_id: string; status: string; charge: number | string; quantity: number; target: string; created_at: string; product_name: string }[];
    }>(`/reseller/customers/${id}`),
  });
  if (detail.isLoading) return <Skeleton className="h-64" />;
  if (!detail.data) return <EmptyState title="Customer not found" body="This customer is not on your panel." />;
  const c = detail.data.customer;
  return (
    <div className="space-y-4">
      <PageHeader title={c.full_name} subtitle={c.email} actions={<Link to="/app/reseller/customers"><Button variant="outline">All customers</Button></Link>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-muted">Balance</p><p className="text-2xl font-extrabold text-brand-700">{money(Number(c.balance))}</p></Card>
        <Card><p className="text-sm text-muted">Orders</p><p className="text-2xl font-extrabold text-brand-700">{detail.data.orders.length}</p></Card>
        <Card><p className="text-sm text-muted">Joined</p><p className="text-lg font-bold">{formatDate(c.created_at)}</p></Card>
      </div>
      <Card>
        <h2 className="font-bold">Orders on your store</h2>
        {!detail.data.orders.length && <p className="mt-2 text-sm text-slate-500">No orders yet.</p>}
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {detail.data.orders.map((o) => (
            <li key={o.public_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold">{publicProductName(o.product_name)}</p>
                <p className="text-muted">#{o.public_id} · {o.status} · {formatDate(o.created_at)}</p>
              </div>
              <p className="font-bold">{money(Number(o.charge))}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
