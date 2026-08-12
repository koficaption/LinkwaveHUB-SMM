import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Category, Paginated, Platform, Product } from "@/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Pagination, Select, Skeleton, Textarea } from "@/components/ui";
import { prettyStatus, statusTone } from "@/utils/cn";

export function AdminProducts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [confirm, setConfirm] = useState<Product | null>(null);

  const platforms = useQuery({ queryKey: ["platforms-all"], queryFn: () => api<Platform[]>("/platforms?all=1") });
  const categories = useQuery({ queryKey: ["categories-all"], queryFn: () => api<Category[]>("/categories?all=1") });
  const products = useQuery({
    queryKey: ["admin-products", search, platformId, categoryId, status, sort, page],
    queryFn: () => api<Paginated<Product>>(`/admin/products?page=${page}&search=${encodeURIComponent(search)}&platformId=${platformId}&categoryId=${categoryId}&status=${status}&sort=${sort}`),
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
          <p className="text-sm text-slate-500">Add a service or import packages from a connected API provider. They appear on the customer marketplace immediately.</p>
        </div>
        <Button onClick={() => setEditing("new")}>Add product</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={platformId} onChange={(e) => setPlatformId(e.target.value)}><option value="">All platforms</option>{platforms.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">All categories</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></Select>
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
              {["Name","Platform","Category","Price / 1k","Cost","Profit","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.data?.items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2"><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id))} /></td>
                <td className="p-2 font-medium">{p.name}</td>
                <td className="p-2">{p.platform_name}</td>
                <td className="p-2">{p.category_name}</td>
                <td className="p-2">{money(p.price_per_1000)}</td>
                <td className="p-2">{money(p.cost_per_1000)}</td>
                <td className="p-2">{money(Number(p.price_per_1000) - Number(p.cost_per_1000 ?? 0))}</td>
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
  const [form, setForm] = useState({
    platformId: product?.platform_id ?? platforms[0]?.id ?? "",
    categoryId: product?.category_id ?? categories[0]?.id ?? "",
    providerId: product?.provider_id ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    minQuantity: product?.min_quantity ?? 100,
    maxQuantity: product?.max_quantity ?? 100000,
    pricePer1000: Number(product?.price_per_1000 ?? 10),
    costPer1000: Number(product?.cost_per_1000 ?? 5),
    resellerPricePer1000: Number(product?.reseller_price_per_1000 ?? 8),
    status: product?.status ?? "active",
    deliveryType: product?.delivery_type ?? "gradual",
    avgDeliveryTime: product?.avg_delivery_time ?? "0-6 hours",
    providerServiceId: product?.provider_service_id ?? "",
    features: (product?.features ?? []).join("\n"),
  });
  const profit = form.pricePer1000 - form.costPer1000;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open title={product ? "Edit product" : "Add product"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-1"><span className="label">Platform</span><Select value={form.platformId} onChange={(e) => set("platformId", e.target.value)}>{platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        <label className="block"><span className="label">Category</span><Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <label className="block sm:col-span-2"><span className="label">Product name</span><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="label">Description</span><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
        <label className="block"><span className="label">Min qty</span><Input type="number" value={form.minQuantity} onChange={(e) => set("minQuantity", Number(e.target.value))} /></label>
        <label className="block"><span className="label">Max qty</span><Input type="number" value={form.maxQuantity} onChange={(e) => set("maxQuantity", Number(e.target.value))} /></label>
        <label className="block"><span className="label">Selling price / 1000</span><Input type="number" value={form.pricePer1000} onChange={(e) => set("pricePer1000", Number(e.target.value))} /></label>
        <label className="block"><span className="label">Cost price / 1000</span><Input type="number" value={form.costPer1000} onChange={(e) => set("costPer1000", Number(e.target.value))} /></label>
        <label className="block"><span className="label">Reseller price / 1000</span><Input type="number" value={form.resellerPricePer1000} onChange={(e) => set("resellerPricePer1000", Number(e.target.value))} /></label>
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">Profit / 1000: <strong>{money(profit)}</strong></div>
        <label className="block"><span className="label">Delivery time</span><Input value={form.avgDeliveryTime} onChange={(e) => set("avgDeliveryTime", e.target.value)} /></label>
        <label className="block"><span className="label">Delivery type</span><Select value={form.deliveryType} onChange={(e) => set("deliveryType", e.target.value)}><option value="instant">Instant</option><option value="gradual">Gradual</option><option value="mixed">Mixed</option></Select></label>
        <label className="block"><span className="label">Provider</span><Select value={form.providerId} onChange={(e) => set("providerId", e.target.value)}><option value="">None</option>{providers.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        <label className="block"><span className="label">Provider service ID</span><Input value={form.providerServiceId} onChange={(e) => set("providerServiceId", e.target.value)} /></label>
        <label className="block"><span className="label">Status</span><Select value={form.status} onChange={(e) => set("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></Select></label>
        <label className="block sm:col-span-2"><span className="label">Features (one per line)</span><Textarea value={form.features} onChange={(e) => set("features", e.target.value)} /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => {
          const payload = { ...form, features: form.features.split("\n").map((s) => s.trim()).filter(Boolean), providerId: form.providerId || null };
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
  const [editing, setEditing] = useState<Record<string, unknown> | "new" | null>(null);
  const [servicesFor, setServicesFor] = useState<string | null>(null);
  const services = useQuery({
    queryKey: ["provider-services", servicesFor],
    queryFn: () => api<{ services: { service: string; name: string; category?: string; rate?: string; min?: string; max?: string }[] }>(`/admin/providers/${servicesFor}/services`),
    enabled: !!servicesFor,
  });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">API providers</h1>
          <p className="text-sm text-slate-500">Connect a panel and import its packages into the catalog. Selling prices use your USD→GHS rate and markup from Settings.</p>
        </div>
        <Button onClick={() => setEditing("new")}>Add provider</Button>
      </div>
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500">{["Name","API URL","Adapter","Balance","Status","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>
            {(list.data ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-medium">{String(row.name)}{row.has_api_key ? <span className="ml-2 text-xs text-emerald-600">key saved</span> : <span className="ml-2 text-xs text-amber-600">no key</span>}</td>
                <td className="p-2 text-xs">{String(row.api_url || "—")}</td>
                <td className="p-2">{String(row.adapter)}</td>
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
                  <button className="font-semibold text-brand-700" onClick={async () => {
                    const toastId = toast.loading("Importing packages from the provider…");
                    try {
                      const result = await api<{ upserted: number; packages: number; deactivated: number }>(`/admin/providers/${row.id}/import`, { method: "POST" });
                      toast.success(`Imported ${result.upserted} packages`, { id: toastId });
                      qc.invalidateQueries({ queryKey: ["admin-products"] });
                      qc.invalidateQueries({ queryKey: ["products"] });
                      qc.invalidateQueries({ queryKey: ["platforms"] });
                      qc.invalidateQueries({ queryKey: ["platforms-all"] });
                      qc.invalidateQueries({ queryKey: ["categories-all"] });
                    } catch (e) {
                      toast.error(e instanceof ApiError ? e.message : "Import failed", { id: toastId });
                    }
                  }}>Import packages</button>
                  <button className="font-semibold text-brand-700" onClick={() => setServicesFor(String(row.id))}>Preview</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editing && <ProviderForm row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {servicesFor && (
        <Modal open title="Provider services" onClose={() => setServicesFor(null)}>
          {services.isLoading && <p className="text-sm text-slate-500">Loading from the panel API…</p>}
          {services.error && <p className="text-sm text-rose-600">{services.error instanceof ApiError ? services.error.message : "Could not load services"}</p>}
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-500">{["ID","Name","Category","Rate","Min","Max"].map((h) => <th key={h} className="p-1">{h}</th>)}</tr></thead>
              <tbody>
                {(services.data?.services ?? []).map((s) => (
                  <tr key={s.service} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-1 font-mono">{s.service}</td>
                    <td className="p-1">{s.name}</td>
                    <td className="p-1">{s.category}</td>
                    <td className="p-1">{s.rate}</td>
                    <td className="p-1">{s.min}</td>
                    <td className="p-1">{s.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">This is a preview. Use <strong>Import packages</strong> to add them to the website catalog.</p>
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
