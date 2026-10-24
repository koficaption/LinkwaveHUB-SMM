import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Category, Paginated, Platform, Product } from "@/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Pagination, Select, Skeleton, Textarea } from "@/components/ui";
import { statusTone } from "@/utils/cn";
import { productRefill } from "@/utils/refill";
import { priceUnitSuffix } from "@/utils/catalog";
import { OrderSelect, SearchField } from "@/components/dashboard/OrderSelect";
import { categoryMatchesPlatform } from "@/components/dashboard/ServiceCatalogFilters";
import { NewOrderPanel } from "@/components/dashboard/NewOrderPanel";
import { isProviderCategory, publicCategoryName } from "@/utils/catalog";
import { ProductQuickAdd, QuickCell } from "@/pages/admin/ProductQuickAdd";
import { serviceNoLabel } from "@/utils/productQuickAdd";

function round4(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(4));
}

function sellFromCost(cost: number, percent: number) {
  return round4(cost * (1 + percent / 100));
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
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState<"quick" | "bulk" | null>(null);
  const [duplicating, setDuplicating] = useState<Product | null>(null);
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
    onSuccess: () => { toast.success("Services updated"); setSelected([]); qc.invalidateQueries({ queryKey: ["admin-products"] }); },
  });

  const patchProduct = async (id: string, body: Record<string, unknown>) => {
    await api(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await qc.invalidateQueries({ queryKey: ["admin-products"] });
    toast.success("Saved");
  };

  const categoryOptions = (categories.data ?? [])
    .filter((c) => !isProviderCategory(c.name))
    .map((c) => ({ value: c.id, label: publicCategoryName(c.name) }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-800 dark:text-brand-200">Services</h1>
          <p className="text-sm text-slate-500">
            {products.data ? `${products.data.total.toLocaleString()} services in the catalog.` : "Add a normal service in under 30 seconds. Advanced fields stay hidden until you need them."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCreating("bulk")}>+ Add multiple services</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreating("quick")}>Add service</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
        <OrderSelect
          label="Platform"
          value={platformId}
          onChange={(value) => { setPlatformId(value); setCategoryId(""); setPage(1); }}
          placeholder="All platforms"
          leadingCheck
          options={(platforms.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <OrderSelect
          label="Category"
          value={categoryId}
          onChange={(value) => { setCategoryId(value); setPage(1); }}
          placeholder="All categories"
          options={(categories.data ?? [])
            .filter((c) => !isProviderCategory(c.name) && categoryMatchesPlatform(c, platformId, platforms.data ?? []))
            .map((c) => ({ value: c.id, label: publicCategoryName(c.name) }))}
        />
        <OrderSelect
          label="Provider"
          value={providerId}
          onChange={(value) => { setProviderId(value); setPage(1); }}
          placeholder="All providers"
          options={(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <OrderSelect
          label="Status"
          value={status}
          onChange={(value) => { setStatus(value); setPage(1); }}
          placeholder="All statuses"
          options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
        />
        <OrderSelect
          label="Refill"
          value={refill}
          onChange={(value) => { setRefill(value); setPage(1); }}
          placeholder="All"
          options={[{ value: "yes", label: "Supported" }, { value: "no", label: "Not supported" }]}
        />
        <OrderSelect
          label="Sort"
          value={sort}
          onChange={setSort}
          placeholder="Newest"
          clearable={false}
          options={[
            { value: "newest", label: "Newest" },
            { value: "name", label: "Name" },
            { value: "price_asc", label: "Price ↑" },
            { value: "price_desc", label: "Price ↓" },
          ]}
        />
      </div>
      {selected.length > 0 && (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => bulk.mutate("active")}>Enable selected</Button>
          <Button variant="outline" onClick={() => bulk.mutate("inactive")}>Disable selected</Button>
        </div>
      )}
      <Card className="mt-4 overflow-x-auto">
        {products.isLoading && <Skeleton className="h-48" />}
        {!products.isLoading && !products.data?.items.length && <EmptyState title="No services" body="Create your first service with Quick Add." />}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="p-2"><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? (products.data?.items.map((p) => p.id) ?? []) : [])} /></th>
              {["Name","Platform","Category","Price","Min","Max","Refill","Status","Visibility","Actions"].map((h) => <th key={h} className="p-2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.data?.items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2"><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id))} /></td>
                <td className="p-2 font-medium">
                  <button className="text-left font-semibold hover:text-brand-700" onClick={() => setEditing(p)}>{p.name}</button>
                  {p.service_no != null && <div className="text-xs text-slate-400">{serviceNoLabel(p)}</div>}
                </td>
                <td className="p-2">{p.platform_name}</td>
                <td className="p-2">
                  <QuickCell
                    display={publicCategoryName(p.category_name)}
                    value={p.category_id}
                    type="select"
                    options={categoryOptions}
                    onSave={(value) => patchProduct(p.id, { categoryId: value })}
                  />
                </td>
                <td className="p-2 whitespace-nowrap">
                  <QuickCell
                    display={<>{money(p.price_per_1000)} <span className="text-xs text-slate-500">{priceUnitSuffix(p)}</span></>}
                    value={Number(p.price_per_1000)}
                    type="number"
                    onSave={(value) => patchProduct(p.id, { pricePer1000: Number(value) })}
                  />
                </td>
                <td className="p-2">
                  <QuickCell display={p.min_quantity} value={p.min_quantity} type="number" onSave={(value) => patchProduct(p.id, { minQuantity: Number(value) })} />
                </td>
                <td className="p-2">
                  <QuickCell display={p.max_quantity} value={p.max_quantity} type="number" onSave={(value) => patchProduct(p.id, { maxQuantity: Number(value) })} />
                </td>
                <td className="p-2">
                  <QuickCell
                    display={productRefill(p).supported ? <Badge className={statusTone.available}>{productRefill(p).days} days</Badge> : <Badge className={statusTone.not_supported}>No</Badge>}
                    value={productRefill(p).supported ? "yes" : "no"}
                    type="select"
                    options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]}
                    onSave={(value) => patchProduct(p.id, { refillSupported: value === "yes", refillDays: productRefill(p).days || 30 })}
                  />
                </td>
                <td className="p-2">
                  <QuickCell
                    display={<Badge className={statusTone[p.status]}>{p.status}</Badge>}
                    value={p.status}
                    type="select"
                    options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
                    onSave={(value) => patchProduct(p.id, { status: value })}
                  />
                </td>
                <td className="p-2">
                  <QuickCell
                    display={p.reseller_available === false ? "Hidden" : "Visible"}
                    value={p.reseller_available === false ? "hidden" : "visible"}
                    type="select"
                    options={[{ value: "visible", label: "Visible" }, { value: "hidden", label: "Hidden" }]}
                    onSave={(value) => patchProduct(p.id, { resellerAvailable: value === "visible" })}
                  />
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <button className="font-semibold text-brand-700" onClick={() => setEditing(p)}>Edit</button>
                    <button className="font-semibold" onClick={() => setDuplicating(p)}>Duplicate</button>
                    <button className="font-semibold text-rose-600" onClick={() => setConfirm(p)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.data && <Pagination page={page} total={products.data.total} limit={products.data.limit} onPage={setPage} />}
      </Card>
      {(creating || editing || duplicating) && (
        <ProductQuickAdd
          key={duplicating ? `dup-${duplicating.id}` : editing?.id || creating || "new"}
          product={duplicating || editing}
          duplicate={!!duplicating}
          startBulk={creating === "bulk"}
          platforms={platforms.data ?? []}
          categories={categories.data ?? []}
          onClose={() => { setCreating(null); setEditing(null); setDuplicating(null); }}
          onViewProduct={(product) => {
            setCreating(null);
            setDuplicating(null);
            setEditing(product);
          }}
        />
      )}
      <ConfirmDialog open={!!confirm} title="Delete service" body="Services with orders are disabled instead of deleted." danger confirmLabel="Delete" onClose={() => setConfirm(null)} onConfirm={async () => {
        if (!confirm) return;
        await api(`/admin/products/${confirm.id}`, { method: "DELETE" });
        toast.success("Service removed");
        setConfirm(null);
        qc.invalidateQueries({ queryKey: ["admin-products"] });
      }} />
    </div>
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

export function AdminNewOrder() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold">New Order</h1>
      <p className="mt-1 text-sm text-slate-500">Place an order with the same Category and Services form customers use.</p>
      <div className="mt-4">
        <NewOrderPanel />
      </div>
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
