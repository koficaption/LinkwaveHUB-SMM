import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Category, Paginated, Platform, Product } from "@/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Pagination, Select, Skeleton, Textarea } from "@/components/ui";
import { prettyStatus, statusTone } from "@/utils/cn";
import { productRefill } from "@/utils/refill";

function round4(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(4));
}

function sellFromCost(cost: number, percent: number) {
  return round4(cost * (1 + percent / 100));
}

function percentFromPrices(cost: number, sell: number) {
  if (!cost) return 0;
  return round4(((sell - cost) / cost) * 100);
}

function markupLabel(cost: number, sell: number) {
  if (!cost) return "—";
  return `${percentFromPrices(cost, sell).toFixed(1)}%`;
}

export function AdminProducts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [status, setStatus] = useState("");
  const [refill, setRefill] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [confirm, setConfirm] = useState<Product | null>(null);

  const platforms = useQuery({ queryKey: ["platforms-all"], queryFn: () => api<Platform[]>("/platforms?all=1") });
  const categories = useQuery({ queryKey: ["categories-all"], queryFn: () => api<Category[]>("/categories?all=1") });
  const providers = useQuery({ queryKey: ["/admin/providers"], queryFn: () => api<{ id: string; name: string }[]>("/admin/providers") });
  const products = useQuery({
    queryKey: ["admin-products", search, platformId, categoryId, providerId, status, refill, sort, page],
    queryFn: () => api<Paginated<Product>>(`/admin/products?page=${page}&limit=100&search=${encodeURIComponent(search)}&platformId=${platformId}&categoryId=${categoryId}&providerId=${providerId}&status=${status}&refill=${refill}&sort=${sort}`),
  });

  const bulk = useMutation({
    mutationFn: (next: "active" | "inactive") => api("/admin/products/bulk-status", { method: "POST", body: JSON.stringify({ ids: selected, status: next }) }),
    onSuccess: () => { toast.success("Products updated"); setSelected([]); qc.invalidateQueries({ queryKey: ["admin-products"] }); },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Products</h1>
          <p className="text-sm text-slate-500">
            {products.data ? `${products.data.total.toLocaleString()} services in the catalog.` : "What customers buy. Set provider cost and your percent to see profit."}
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>Add product</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-7">
        <Input placeholder="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select value={platformId} onChange={(e) => { setPlatformId(e.target.value); setPage(1); }}><option value="">All platforms</option>{platforms.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}><option value="">All categories</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={providerId} onChange={(e) => { setProviderId(e.target.value); setPage(1); }}><option value="">All providers</option>{providers.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></Select>
        <Select value={refill} onChange={(e) => { setRefill(e.target.value); setPage(1); }}>
          <option value="">Refill: All</option>
          <option value="yes">Supported</option>
          <option value="no">Not supported</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="name">Name</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
        </Select>
      </div>
      {selected.length > 0 && (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => bulk.mutate("active")}>Enable selected</Button>
          <Button variant="outline" onClick={() => bulk.mutate("inactive")}>Disable selected</Button>
        </div>
      )}
      <Card className="mt-4 overflow-x-auto">
        {products.isLoading && <Skeleton className="h-48" />}
        {!products.isLoading && !products.data?.items.length && <EmptyState title="No products" body="Create your first service." />}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="p-2"><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? (products.data?.items.map((p) => p.id) ?? []) : [])} /></th>
              {["Name","Platform","Provider","Provider cost","Your %","Sell / 1k","Profit","Refill","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.data?.items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2"><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id))} /></td>
                <td className="p-2 font-medium">{p.name}</td>
                <td className="p-2">{p.platform_name}</td>
                <td className="p-2">{p.provider_name || "—"}</td>
                <td className="p-2">{money(p.cost_per_1000)}</td>
                <td className="p-2">{markupLabel(Number(p.cost_per_1000), Number(p.price_per_1000))}</td>
                <td className="p-2">{money(p.price_per_1000)}</td>
                <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400">{money(Number(p.price_per_1000) - Number(p.cost_per_1000 ?? 0))}</td>
                <td className="p-2">{productRefill(p).supported ? <Badge className={statusTone.available}>{productRefill(p).days} days</Badge> : <Badge className={statusTone.not_supported}>No</Badge>}</td>
                <td className="p-2"><Badge className={statusTone[p.status]}>{p.status}</Badge></td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <button className="font-semibold text-brand-700" onClick={() => setEditing(p)}>Edit</button>
                    <button className="font-semibold" onClick={async () => { await api(`/admin/products/${p.id}/duplicate`, { method: "POST" }); toast.success("Duplicated"); qc.invalidateQueries({ queryKey: ["admin-products"] }); }}>Duplicate</button>
                    <button className="font-semibold text-rose-600" onClick={() => setConfirm(p)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.data && <Pagination page={page} total={products.data.total} limit={products.data.limit} onPage={setPage} />}
      </Card>
      {editing && <ProductForm product={editing === "new" ? null : editing} platforms={platforms.data ?? []} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!confirm} title="Delete product" body="Products with orders are disabled instead of deleted." danger confirmLabel="Delete" onClose={() => setConfirm(null)} onConfirm={async () => {
        if (!confirm) return;
        await api(`/admin/products/${confirm.id}`, { method: "DELETE" });
        toast.success("Product removed");
        setConfirm(null);
        qc.invalidateQueries({ queryKey: ["admin-products"] });
      }} />
    </div>
  );
}

function ProductForm({ product, platforms, categories, onClose }: { product: Product | null; platforms: Platform[]; categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api<{ id: string; name: string }[]>("/admin/providers") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Record<string, Record<string, unknown>>>("/admin/settings") });
  const defaultPercent = Number(settings.data?.pricing?.importMarkupPercent ?? 40);
  const startCost = Number(product?.cost_per_1000 ?? 0);
  const startSell = Number(product?.price_per_1000 ?? 0);
  const [form, setForm] = useState({
    platformId: product?.platform_id ?? platforms[0]?.id ?? "",
    categoryId: product?.category_id ?? categories[0]?.id ?? "",
    providerId: product?.provider_id ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    minQuantity: product?.min_quantity ?? 100,
    maxQuantity: product?.max_quantity ?? 100000,
    costPer1000: startCost,
    markupPercent: startCost > 0 && startSell > 0 ? percentFromPrices(startCost, startSell) : defaultPercent,
    pricePer1000: startSell || sellFromCost(startCost, defaultPercent),
    resellerPricePer1000: Number(product?.reseller_price_per_1000 ?? 0),
    apiPricePer1000: Number(product?.api_price_per_1000 ?? 0),
    apiMinQuantity: Number(product?.api_min_quantity ?? 0) || "",
    apiMaxQuantity: Number(product?.api_max_quantity ?? 0) || "",
    status: product?.status ?? "active",
    deliveryType: product?.delivery_type ?? "gradual",
    avgDeliveryTime: product?.avg_delivery_time ?? "0-6 hours",
    providerServiceId: product?.provider_service_id ?? "",
    features: (product?.features ?? []).join("\n"),
    refillSupported: productRefill(product ?? {}).supported,
    refillDays: productRefill(product ?? {}).days,
    refillType: product?.refill_type ?? "",
    refillServiceId: product?.refill_service_id ?? "",
    refillLimit: product?.refill_limit ?? 1,
    refillInstructions: product?.refill_instructions ?? "",
    providerRefillSupported: Boolean(product?.provider_refill_supported),
    resellerAvailable: product?.reseller_available !== false,
    apiAvailable: Boolean(product?.api_available),
    priceUnit: product?.price_unit === "each" ? "each" : "per_1000",
  });
  const profit = round4(form.pricePer1000 - form.costPer1000);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const setCost = (cost: number) => {
    const next = sellFromCost(cost, form.markupPercent);
    setForm((f) => ({ ...f, costPer1000: cost, pricePer1000: next }));
  };
  const setPercent = (percent: number) => {
    const next = sellFromCost(form.costPer1000, percent);
    setForm((f) => ({ ...f, markupPercent: percent, pricePer1000: next }));
  };
  const setSell = (sell: number) => {
    setForm((f) => ({ ...f, pricePer1000: sell, markupPercent: percentFromPrices(f.costPer1000, sell) }));
  };

  return (
    <Modal open title={product ? "Edit product" : "Add product"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Platform</span><Select value={form.platformId} onChange={(e) => set("platformId", e.target.value)}>{platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        <label className="block"><span className="label">Category</span><Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <label className="block sm:col-span-2"><span className="label">Product name</span><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <div className="sm:col-span-2 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-500/10">
          <p className="text-sm font-semibold">Your price</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {form.priceUnit === "each"
              ? "This price is charged once per quantity (for Netflix, subscriptions, and similar packages). Quantity 1 = this amount."
              : "Provider cost is what you pay the panel. Followers, likes and views are priced per 1,000. Quantity 1 of ₵120 / 1,000 costs ₵0.12."}
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.priceUnit === "each"} onChange={(e) => set("priceUnit", e.target.checked ? "each" : "per_1000")} />
            Charge this price for each item (package / subscription)
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="label">{form.priceUnit === "each" ? "Provider cost each (GHS)" : "Provider cost / 1000 (GHS)"}</span><Input type="number" step="0.01" value={form.costPer1000} onChange={(e) => setCost(Number(e.target.value))} /></label>
            <label className="block"><span className="label">Your percent %</span><Input type="number" step="0.1" value={form.markupPercent} onChange={(e) => setPercent(Number(e.target.value))} /></label>
            <label className="block"><span className="label">{form.priceUnit === "each" ? "Customer pays each" : "Customer pays / 1000"}</span><Input type="number" step="0.01" value={form.pricePer1000} onChange={(e) => setSell(Number(e.target.value))} /></label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
            <div className="rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-900/60">Profit {form.priceUnit === "each" ? "each" : "/ 1000"}: <strong className="text-emerald-700 dark:text-emerald-400">{money(profit)}</strong></div>
            <div className="rounded-xl bg-white/80 px-3 py-2 dark:bg-slate-900/60">{form.priceUnit === "each" ? `Qty 1 costs the customer ${money(form.pricePer1000)}` : `On 1000 units you keep ${money(profit)} after paying the provider ${money(form.costPer1000)}`}</div>
          </div>
        </div>
        <label className="block"><span className="label">Reseller price / 1000 (optional)</span><Input type="number" step="0.01" value={form.resellerPricePer1000} onChange={(e) => set("resellerPricePer1000", Number(e.target.value))} /></label>
        <label className="block"><span className="label">Min qty</span><Input type="number" value={form.minQuantity} onChange={(e) => set("minQuantity", Number(e.target.value))} /></label>
        <label className="block"><span className="label">Max qty</span><Input type="number" value={form.maxQuantity} onChange={(e) => set("maxQuantity", Number(e.target.value))} /></label>
        <label className="block"><span className="label">Status</span><Select value={form.status} onChange={(e) => set("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></Select></label>
        <label className="block sm:col-span-2"><span className="label">Description</span><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
        <label className="block"><span className="label">Provider</span><Select value={form.providerId} onChange={(e) => set("providerId", e.target.value)}><option value="">None</option>{providers.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        <label className="block"><span className="label">Provider service ID</span><Input value={form.providerServiceId} onChange={(e) => set("providerServiceId", e.target.value)} /></label>
        <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-semibold">Refill settings</p>
          <p className="mt-1 text-xs text-slate-500">Only enable refill when this service actually offers it. Do not turn this on just because an order completed.</p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.refillSupported} onChange={(e) => set("refillSupported", e.target.checked)} />
            Refill supported
          </label>
          {form.refillSupported && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="label">Refill period (days)</span><Input type="number" value={form.refillDays} onChange={(e) => set("refillDays", Number(e.target.value))} /></label>
              <label className="block"><span className="label">Maximum refills</span><Input type="number" value={form.refillLimit} onChange={(e) => set("refillLimit", Number(e.target.value))} /></label>
              <label className="block"><span className="label">Refill service ID</span><Input value={form.refillServiceId} onChange={(e) => set("refillServiceId", e.target.value)} /></label>
              <label className="block"><span className="label">Refill type</span><Input value={form.refillType} onChange={(e) => set("refillType", e.target.value)} placeholder="auto / manual" /></label>
              <label className="block sm:col-span-2"><span className="label">Refill instructions</span><Textarea value={form.refillInstructions} onChange={(e) => set("refillInstructions", e.target.value)} /></label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.providerRefillSupported} onChange={(e) => set("providerRefillSupported", e.target.checked)} />
                Provider supports automatic refill API
              </label>
            </div>
          )}
        </div>
        <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-semibold">Availability</p>
          <p className="mt-1 text-xs text-slate-500">The same product can be sold on the customer dashboard, reseller storefront, and developer API.</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.resellerAvailable} onChange={(e) => set("resellerAvailable", e.target.checked)} /> Reseller</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.apiAvailable} onChange={(e) => set("apiAvailable", e.target.checked)} /> API available</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.status === "active"} onChange={(e) => set("status", e.target.checked ? "active" : "inactive")} /> Active</label>
          </div>
          {form.apiAvailable && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="label">API price / 1000</span><Input type="number" step="0.01" value={form.apiPricePer1000} onChange={(e) => set("apiPricePer1000", Number(e.target.value))} /></label>
              <label className="block"><span className="label">API min qty</span><Input type="number" value={form.apiMinQuantity} onChange={(e) => set("apiMinQuantity", e.target.value === "" ? "" : Number(e.target.value))} /></label>
              <label className="block"><span className="label">API max qty</span><Input type="number" value={form.apiMaxQuantity} onChange={(e) => set("apiMaxQuantity", e.target.value === "" ? "" : Number(e.target.value))} /></label>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => {
          const payload = {
            ...form,
            features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
            providerId: form.providerId || null,
            apiPricePer1000: Number(form.apiPricePer1000) || null,
            apiMinQuantity: form.apiMinQuantity === "" ? null : Number(form.apiMinQuantity),
            apiMaxQuantity: form.apiMaxQuantity === "" ? null : Number(form.apiMaxQuantity),
          };
          try {
            if (product) await api(`/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            else await api("/admin/products", { method: "POST", body: JSON.stringify(payload) });
            toast.success(product ? "Product updated" : "Product created successfully");
            qc.invalidateQueries({ queryKey: ["admin-products"] });
            qc.invalidateQueries({ queryKey: ["products"] });
            onClose();
          } catch (e) { toast.error(e instanceof ApiError ? e.message : "Save failed"); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}

export function AdminSimpleCrud({
  title,
  path,
  fields,
}: {
  title: string;
  path: string;
  fields: { key: string; label: string; type?: string }[];
}) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [path], queryFn: () => api<Record<string, unknown>[]>(path.includes("admin") ? path : `${path}?all=1`) });
  const [editing, setEditing] = useState<Record<string, unknown> | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const open = (row: Record<string, unknown> | "new") => {
    setEditing(row);
    if (row === "new") setForm({});
    else {
      const next: Record<string, string> = {};
      for (const f of fields) next[f.key] = String(row[f.key] ?? row[f.key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? "");
      if (row.name) next.name = String(row.name);
      if (row.description != null) next.description = String(row.description);
      if (row.icon != null) next.icon = String(row.icon);
      if (row.color != null) next.color = String(row.color);
      if (row.api_url != null) next.apiUrl = String(row.api_url);
      if (row.adapter != null) next.adapter = String(row.adapter);
      if (row.currency != null) next.currency = String(row.currency);
      if (row.notes != null) next.notes = String(row.notes);
      setForm(next);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <Button onClick={() => open("new")}>Add</Button>
      </div>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Name","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {(list.data ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-medium">{String(row.name)}</td>
                <td className="p-2"><Badge className={statusTone[String(row.is_active === false || row.status === "inactive" ? "inactive" : "active")]}>{String(row.is_active === false || row.status === "inactive" ? "inactive" : row.status || "active")}</Badge></td>
                <td className="p-2 space-x-3">
                  <button className="font-semibold text-brand-700" onClick={() => open(row)}>Edit</button>
                  <button className="font-semibold text-rose-600" onClick={async () => {
                    const id = String(row.id);
                    const endpoint = path.startsWith("/admin") ? path : `/admin${path}`;
                    await api(`${endpoint}/${id}`, { method: "DELETE" });
                    toast.success("Deleted");
                    qc.invalidateQueries({ queryKey: [path] });
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editing && (
        <Modal open title={editing === "new" ? `Add ${title.slice(0, -1)}` : `Edit ${title.slice(0, -1)}`} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="label">{f.label}</span>
                {f.type === "textarea" ? <Textarea value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} /> : <Input type={f.type || "text"} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive !== "false"} onChange={(e) => setForm({ ...form, isActive: e.target.checked ? "true" : "false" })} /> Active</label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={async () => {
              const endpoint = path.startsWith("/admin") ? path : `/admin${path}`;
              const payload: Record<string, unknown> = { ...form, isActive: form.isActive !== "false" };
              if (form.sortOrder) payload.sortOrder = Number(form.sortOrder);
              try {
                if (editing === "new") await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
                else await api(`${endpoint}/${(editing as Record<string, unknown>).id}`, { method: "PATCH", body: JSON.stringify(payload) });
                toast.success("Saved");
                qc.invalidateQueries({ queryKey: [path] });
                setEditing(null);
              } catch (e) { toast.error(e instanceof ApiError ? e.message : "Save failed"); }
            }}>Save</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function AdminPlatforms() {
  return <AdminSimpleCrud title="Platforms" path="/platforms" fields={[{ key: "name", label: "Name" }, { key: "description", label: "Description", type: "textarea" }, { key: "icon", label: "Icon (Lucide name)" }, { key: "color", label: "Color" }, { key: "iconUrl", label: "Icon URL" }]} />;
}

export function AdminCategories() {
  return <AdminSimpleCrud title="Categories" path="/categories" fields={[{ key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "icon", label: "Icon" }]} />;
}

export function AdminProviders() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["/admin/providers"], queryFn: () => api<Record<string, unknown>[]>("/admin/providers") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Record<string, Record<string, unknown>>>("/admin/settings") });
  const [editing, setEditing] = useState<Record<string, unknown> | "new" | null>(null);
  const [servicesFor, setServicesFor] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [svcPage, setSvcPage] = useState(1);
  const services = useQuery({
    queryKey: ["provider-services", servicesFor],
    queryFn: () => api<{ services: { service: string; name: string; category?: string; rate?: string; min?: string; max?: string }[] }>(`/admin/providers/${servicesFor}/services`),
    enabled: !!servicesFor,
  });
  const usdToGhs = Number(settings.data?.pricing?.usdToGhs ?? 15.4);
  const markup = percent ?? Number(settings.data?.pricing?.importMarkupPercent ?? 40);
  const filtered = (services.data?.services ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${s.name} ${s.category} ${s.service}`.toLowerCase().includes(q);
  });
  const svcPageSize = 100;
  const svcTotal = filtered.length;
  const visibleServices = filtered.slice((svcPage - 1) * svcPageSize, svcPage * svcPageSize);
  const providerPackageCount = services.data?.services.length ?? 0;

  const importWithPercent = async (providerId: string, markupPercent: number) => {
    const toastId = toast.loading("Importing packages from the provider…");
    try {
      const result = await api<{ upserted: number; packages: number; deactivated: number }>(`/admin/providers/${providerId}/import`, {
        method: "POST",
        body: JSON.stringify({ markupPercent }),
      });
      toast.success(`Imported ${result.upserted} packages at ${markupPercent}%`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["platforms"] });
      qc.invalidateQueries({ queryKey: ["platforms-all"] });
      qc.invalidateQueries({ queryKey: ["categories-all"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed", { id: toastId });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Provider prices</h1>
          <p className="text-sm text-slate-500">ResellerSMM is the live panel. Import all of its packages into the catalog, then customers can buy them.</p>
        </div>
        <Button onClick={() => setEditing("new")}>Add provider</Button>
      </div>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Name","API URL","Packages","Balance","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {(list.data ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-medium">{String(row.name)}{row.has_api_key ? <span className="ml-2 text-xs text-emerald-600">key saved</span> : <span className="ml-2 text-xs text-amber-600">no key</span>}</td>
                <td className="p-2 text-xs">{String(row.api_url || "—")}</td>
                <td className="p-2 whitespace-nowrap">{Number(row.active_product_count ?? row.product_count ?? 0).toLocaleString()}</td>
                <td className="p-2">{row.balance != null ? String(row.balance) : "—"} {String(row.currency || "")}</td>
                <td className="p-2"><Badge className={statusTone[String(row.status)]}>{String(row.status)}</Badge></td>
                <td className="p-2 space-x-2">
                  <button className="font-semibold text-brand-700" onClick={() => setEditing(row)}>Edit</button>
                  <button className="font-semibold text-brand-700" onClick={async () => {
                    try {
                      const result = await api<{ balance: number }>(`/admin/providers/${row.id}/balance`, { method: "POST" });
                      toast.success(`Balance: ${result.balance}`);
                      qc.invalidateQueries({ queryKey: ["/admin/providers"] });
                    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Balance check failed"); }
                  }}>Test</button>
                  <button className="font-semibold text-brand-700" onClick={() => { setPercent(null); setSearch(""); setSvcPage(1); setServicesFor(String(row.id)); }}>See prices</button>
                  <button className="font-semibold text-brand-700" onClick={() => importWithPercent(String(row.id), markup)}>Import all packages</button>
                  {(list.data ?? []).length > 1 && (
                    <button className="font-semibold text-rose-600" onClick={async () => {
                      if (!window.confirm(`Remove ${String(row.name)}? Its catalog items will be disabled.`)) return;
                      try {
                        await api(`/admin/providers/${row.id}`, { method: "DELETE" });
                        toast.success("Provider removed");
                        qc.invalidateQueries({ queryKey: ["/admin/providers"] });
                        qc.invalidateQueries({ queryKey: ["admin-products"] });
                      } catch (e) { toast.error(e instanceof ApiError ? e.message : "Could not delete provider"); }
                    }}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editing && <ProviderForm row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {servicesFor && (
        <Modal open title="Provider prices and your profit" onClose={() => setServicesFor(null)}>
          {services.error && <p className="text-sm text-rose-600">{services.error instanceof ApiError ? services.error.message : "Could not load services"}</p>}
          <p className="mb-2 text-xs text-slate-500">
            {services.isLoading
              ? "Loading every package from this provider…"
              : `${providerPackageCount.toLocaleString()} packages from the provider. USD ${usdToGhs} → GHS. Provider cost is converted, then your percent is added.`}
          </p>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="label">Your percent %</span>
              <Input type="number" step="0.1" value={markup} onChange={(e) => setPercent(Number(e.target.value))} />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Search</span>
              <Input placeholder="TikTok followers…" value={search} onChange={(e) => { setSearch(e.target.value); setSvcPage(1); }} />
            </label>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-500">{["Name","Provider","Your cost","Customer pays","Your profit"].map((h) => <th key={h} className="p-1">{h}</th>)}</tr></thead>
              <tbody>
                {visibleServices.map((s) => {
                  const rateUsd = Number(s.rate ?? 0);
                  const cost = round4(rateUsd * usdToGhs);
                  const sell = sellFromCost(cost, markup);
                  const profit = round4(sell - cost);
                  return (
                    <tr key={s.service} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-1">
                        <span className="font-medium">{s.name}</span>
                        <span className="block text-[11px] text-slate-500">{s.category} · ID {s.service}</span>
                      </td>
                      <td className="p-1 whitespace-nowrap">{rateUsd} USD</td>
                      <td className="p-1 whitespace-nowrap">{money(cost)}</td>
                      <td className="p-1 whitespace-nowrap">{money(sell)}</td>
                      <td className="p-1 whitespace-nowrap font-semibold text-emerald-700 dark:text-emerald-400">{money(profit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={svcPage} total={svcTotal} limit={svcPageSize} onPage={setSvcPage} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setServicesFor(null)}>Close</Button>
            <Button onClick={async () => {
              await importWithPercent(servicesFor, markup);
              setServicesFor(null);
            }}>Import all {providerPackageCount.toLocaleString()} packages at {markup}%</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProviderForm({ row, onClose }: { row: Record<string, unknown> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: String(row?.name ?? "ResellersMM"),
    apiUrl: String(row?.api_url ?? "https://resellersmm.com/api/v2"),
    apiKey: "",
    adapter: String(row?.adapter ?? "generic_http"),
    currency: String(row?.currency ?? "USD"),
    notes: String(row?.notes ?? ""),
    status: String(row?.status ?? "active"),
    importPackages: !row,
  });
  return (
    <Modal open title={row ? "Edit API provider" : "Add API provider"} onClose={onClose}>
      <div className="space-y-3">
        <label className="block"><span className="label">Name</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="label">API URL</span><Input value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} /></label>
        <label className="block"><span className="label">API key</span><Input type="password" placeholder={row?.has_api_key ? "Leave blank to keep the saved key" : "Paste panel API key"} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} /></label>
        <label className="block"><span className="label">Adapter</span>
          <Select value={form.adapter} onChange={(e) => setForm({ ...form, adapter: e.target.value })}>
            <option value="generic_http">generic_http (resellersmm / PerfectPanel v2)</option>
            <option value="mock">mock (no live orders)</option>
          </Select>
        </label>
        <label className="block"><span className="label">Provider currency</span><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></label>
        <label className="block"><span className="label">Status</span>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </label>
        <label className="block"><span className="label">Notes</span><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.importPackages} onChange={(e) => setForm({ ...form, importPackages: e.target.checked })} />
          Import all packages into the catalog now
        </label>
        <p className="text-xs text-slate-500">If you already saved the key, you can also use <strong>Import packages</strong> on the provider list. A new key on save will import automatically when this box is checked.</p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => {
          const payload: Record<string, unknown> = { ...form };
          if (!form.apiKey) delete payload.apiKey;
          try {
            const toastId = form.importPackages && (form.apiKey || !row) ? toast.loading("Saving provider and importing packages…") : undefined;
            const result = row
              ? await api<{ imported?: { upserted: number } }>(`/admin/providers/${row.id}`, { method: "PATCH", body: JSON.stringify(payload) })
              : await api<{ imported?: { upserted: number } }>("/admin/providers", { method: "POST", body: JSON.stringify(payload) });
            const imported = result.imported?.upserted;
            toast.success(imported ? `Provider saved. Imported ${imported} packages.` : "Provider saved", toastId ? { id: toastId } : undefined);
            qc.invalidateQueries({ queryKey: ["/admin/providers"] });
            qc.invalidateQueries({ queryKey: ["admin-products"] });
            qc.invalidateQueries({ queryKey: ["products"] });
            qc.invalidateQueries({ queryKey: ["platforms"] });
            onClose();
          } catch (e) { toast.error(e instanceof ApiError ? e.message : "Save failed"); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}
