import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Category, Platform, Product } from "@/types";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { OrderSelect } from "@/components/dashboard/OrderSelect";
import { categoryMatchesPlatform } from "@/components/dashboard/ServiceCatalogFilters";
import { isProviderCategory, publicCategoryName } from "@/utils/catalog";
import { productRefill } from "@/utils/refill";
import {
  inferServiceType,
  isPerUnitType,
  lastCategoryForPlatform,
  percentFromPrices,
  readLastUsed,
  round4,
  sellFromCost,
  SERVICE_TYPE_OPTIONS,
  serviceNoLabel,
  writeLastUsed,
  type ServiceType,
} from "@/utils/productQuickAdd";

type Mode = "quick" | "advanced" | "bulk";
type Screen = "form" | "success";

type FormState = {
  platformId: string;
  categoryId: string;
  providerId: string;
  name: string;
  description: string;
  orderInstructions: string;
  minQuantity: number;
  maxQuantity: number;
  costPer1000: number;
  markupPercent: number;
  pricePer1000: number;
  resellerPricePer1000: number;
  apiPricePer1000: number;
  apiMinQuantity: number | "";
  apiMaxQuantity: number | "";
  status: "active" | "inactive";
  deliveryType: string;
  avgDeliveryTime: string;
  providerServiceId: string;
  features: string;
  refillSupported: boolean;
  refillDays: number;
  refillType: string;
  refillServiceId: string;
  refillLimit: number;
  refillInstructions: string;
  providerRefillSupported: boolean;
  resellerAvailable: boolean;
  apiAvailable: boolean;
  priceUnit: "each" | "per_1000";
  serviceType: ServiceType;
  stock: number | "";
  deliveryMethod: string;
  imageUrl: string;
};

type BulkRow = { key: string; name: string; price: string; min: string; max: string; refill: "yes" | "no" };

function emptyBulkRow(): BulkRow {
  return { key: crypto.randomUUID(), name: "", price: "", min: "100", max: "1000", refill: "no" };
}

function initialForm(product: Product | null, platforms: Platform[], categories: Category[], duplicate: boolean): FormState {
  const last = readLastUsed();
  const startCost = Number(product?.cost_per_1000 ?? 0);
  const startSell = Number(product?.price_per_1000 ?? 0);
  const serviceType = inferServiceType(product);
  const platformId = product?.platform_id || last.platformId || platforms[0]?.id || "";
  const matching = categories.filter((c) => !isProviderCategory(c.name) && categoryMatchesPlatform(c, platformId, platforms));
  const categoryId = product?.category_id
    || lastCategoryForPlatform(platformId)
    || matching[0]?.id
    || "";
  return {
    platformId,
    categoryId,
    providerId: product?.provider_id || (serviceType === "api" ? last.providerId : "") || "",
    name: product ? (duplicate ? `${product.name} (Copy)` : product.name) : "",
    description: product?.description ?? "",
    orderInstructions: "",
    minQuantity: product?.min_quantity ?? (isPerUnitType(serviceType) ? 1 : 100),
    maxQuantity: product?.max_quantity ?? (isPerUnitType(serviceType) ? 1 : 1000),
    costPer1000: startCost,
    markupPercent: startCost > 0 && startSell > 0 ? percentFromPrices(startCost, startSell) : 40,
    pricePer1000: startSell,
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
    refillDays: productRefill(product ?? {}).days || 30,
    refillType: product?.refill_type ?? "",
    refillServiceId: product?.refill_service_id ?? "",
    refillLimit: product?.refill_limit ?? 1,
    refillInstructions: product?.refill_instructions ?? "",
    providerRefillSupported: Boolean(product?.provider_refill_supported),
    resellerAvailable: product?.reseller_available !== false,
    apiAvailable: Boolean(product?.api_available),
    priceUnit: product?.price_unit === "each" || isPerUnitType(serviceType) ? "each" : "per_1000",
    serviceType: product ? serviceType : last.serviceType || "manual",
    stock: product?.stock ?? "",
    deliveryMethod: product?.delivery_method ?? "",
    imageUrl: product?.image_url ?? "",
  };
}

function payloadFromForm(form: FormState) {
  const perUnit = form.priceUnit === "each" || isPerUnitType(form.serviceType);
  return {
    platformId: form.platformId,
    categoryId: form.categoryId,
    providerId: form.serviceType === "api" && form.providerId ? form.providerId : null,
    name: form.name.trim(),
    description: form.description || null,
    orderInstructions: form.orderInstructions || null,
    minQuantity: Number(form.minQuantity) || (perUnit ? 1 : 100),
    maxQuantity: Number(form.maxQuantity) || (perUnit ? Number(form.stock) || 1 : 100000),
    pricePer1000: Number(form.pricePer1000) || 0,
    costPer1000: Number(form.costPer1000) || 0,
    resellerPricePer1000: Number(form.resellerPricePer1000) || null,
    apiPricePer1000: Number(form.apiPricePer1000) || null,
    apiMinQuantity: form.apiMinQuantity === "" ? null : Number(form.apiMinQuantity),
    apiMaxQuantity: form.apiMaxQuantity === "" ? null : Number(form.apiMaxQuantity),
    status: form.status,
    deliveryType: form.deliveryType,
    avgDeliveryTime: form.avgDeliveryTime,
    providerServiceId: form.providerServiceId || null,
    features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
    refillSupported: form.refillSupported,
    refillDays: form.refillDays,
    refillType: form.refillType || null,
    refillServiceId: form.refillServiceId || null,
    refillInstructions: form.refillInstructions || null,
    refillLimit: form.refillLimit,
    providerRefillSupported: form.providerRefillSupported,
    resellerAvailable: form.resellerAvailable,
    apiAvailable: form.apiAvailable,
    priceUnit: perUnit ? "each" : "per_1000",
    contactAdmin: form.serviceType !== "api" || !form.providerId,
    serviceType: form.serviceType,
    stock: form.stock === "" ? null : Number(form.stock),
    deliveryMethod: form.deliveryMethod || null,
    imageUrl: form.imageUrl || null,
  };
}

export function ProductQuickAdd({
  product,
  duplicate = false,
  startBulk = false,
  platforms,
  categories,
  onClose,
  onCreated,
  onViewProduct,
}: {
  product: Product | null;
  duplicate?: boolean;
  startBulk?: boolean;
  platforms: Platform[];
  categories: Category[];
  onClose: () => void;
  onCreated?: (created: Product) => void;
  onViewProduct?: (product: Product) => void;
}) {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ["/admin/providers"], queryFn: () => api<{ id: string; name: string }[]>("/admin/providers") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Record<string, Record<string, unknown>>>("/admin/settings") });
  const defaultPercent = Number(settings.data?.pricing?.importMarkupPercent ?? 40);
  const isNew = !product || duplicate;
  const [mode, setMode] = useState<Mode>(startBulk ? "bulk" : "quick");
  const [screen, setScreen] = useState<Screen>("form");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(() => {
    const next = initialForm(product, platforms, categories, duplicate);
    if (!product && defaultPercent) next.markupPercent = defaultPercent;
    return next;
  });
  const [newCategory, setNewCategory] = useState("");
  const [newPlatform, setNewPlatform] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewPlatform, setShowNewPlatform] = useState(false);
  const [pendingPlatformIcon, setPendingPlatformIcon] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);

  const set = (key: keyof FormState, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const visibleCategories = useMemo(() => categories.filter((category) => {
    if (isProviderCategory(category.name)) return false;
    if (!form.platformId) return true;
    if (categoryMatchesPlatform(category, form.platformId, platforms)) return true;
    return (category.platform_ids || []).map(String).includes(form.platformId);
  }), [categories, form.platformId, platforms]);

  const perUnit = form.priceUnit === "each" || isPerUnitType(form.serviceType);
  const showQty = form.serviceType !== "digital_product";
  const showProvider = form.serviceType === "api" || mode === "advanced";
  const showRefill = form.serviceType !== "digital_product";
  const digital = form.serviceType === "digital_product";

  const remember = (extra?: Partial<FormState>) => {
    const next = extra ? { ...form, ...extra } : form;
    writeLastUsed({
      platformId: next.platformId,
      categoryId: next.categoryId,
      serviceType: next.serviceType,
      providerId: next.providerId,
    });
  };

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ["admin-products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["platforms-all"] });
    qc.invalidateQueries({ queryKey: ["categories-all"] });
  };

  const changePlatform = (platformId: string) => {
    const matching = categories.filter((category) => !isProviderCategory(category.name) && (
      categoryMatchesPlatform(category, platformId, platforms) || (category.platform_ids || []).map(String).includes(platformId)
    ));
    const preferred = lastCategoryForPlatform(platformId);
    const categoryId = matching.find((category) => category.id === preferred)?.id
      || matching.find((category) => category.id === form.categoryId)?.id
      || matching[0]?.id
      || "";
    setForm((current) => ({ ...current, platformId, categoryId }));
  };

  const changeServiceType = (serviceType: ServiceType) => {
    const unit = isPerUnitType(serviceType);
    setForm((current) => ({
      ...current,
      serviceType,
      providerId: serviceType === "api" ? current.providerId : "",
      refillSupported: serviceType === "digital_product" ? false : current.refillSupported,
      priceUnit: unit ? "each" : "per_1000",
      minQuantity: unit ? 1 : (current.minQuantity === 1 ? 100 : current.minQuantity),
      maxQuantity: unit ? Math.max(Number(current.stock) || 1, 1) : (current.maxQuantity === 1 ? 1000 : current.maxQuantity),
    }));
  };

  const uploadImage = async (file: File, field: "imageUrl") => {
    const body = new FormData();
    body.append("file", file);
    const result = await api<{ url: string }>("/admin/uploads", { method: "POST", body });
    set(field, result.url);
    toast.success("Image uploaded");
  };

  const save = async (addAnother: boolean) => {
    if (!form.name.trim()) return toast.error("Enter a service name");
    if (!form.platformId) return toast.error("Select a platform");
    if (!form.categoryId) return toast.error("Select a category");
    setSaving(true);
    try {
      const payload = payloadFromForm(form);
      const saved = (!isNew && product)
        ? await api<Product>(`/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<Product>("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      remember();
      refreshLists();
      if (!isNew && product) {
        toast.success("Service updated");
        onClose();
        return;
      }
      setCreated(saved);
      onCreated?.(saved);
      if (addAnother) {
        toast.success("Service added");
        setForm((current) => ({
          ...initialForm(null, platforms, categories, false),
          platformId: current.platformId,
          categoryId: current.categoryId,
          serviceType: current.serviceType,
          providerId: current.providerId,
          markupPercent: current.markupPercent,
        }));
        setScreen("form");
      } else {
        setScreen("success");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveBulk = async () => {
    const items = bulkRows
      .map((row) => ({
        name: row.name.trim(),
        pricePer1000: Number(row.price),
        minQuantity: Number(row.min) || 100,
        maxQuantity: Number(row.max) || 1000,
        refillSupported: row.refill === "yes",
      }))
      .filter((row) => row.name);
    if (!form.platformId || !form.categoryId) return toast.error("Choose a platform and category first");
    if (!items.length) return toast.error("Enter at least one service name");
    setSaving(true);
    try {
      const result = await api<{ created: Product[]; errors: { name: string; message: string }[]; saved: number }>("/admin/products/bulk", {
        method: "POST",
        body: JSON.stringify({
          platformId: form.platformId,
          categoryId: form.categoryId,
          serviceType: form.serviceType,
          providerId: form.serviceType === "api" ? form.providerId || null : null,
          items,
        }),
      });
      remember();
      refreshLists();
      if (result.errors?.length) toast.error(`${result.errors.length} could not be saved`);
      toast.success(`${result.saved} services added`);
      if (result.created?.[0]) {
        setCreated(result.created[0]);
        setScreen("success");
      } else onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createCategory = useMutation({
    mutationFn: () => api<Category>("/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: newCategory.trim(), platformIds: form.platformId ? [form.platformId] : [] }),
    }),
    onSuccess: (row) => {
      toast.success("Category created");
      setForm((current) => ({ ...current, categoryId: row.id }));
      setNewCategory("");
      setShowNewCategory(false);
      qc.invalidateQueries({ queryKey: ["categories-all"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not create category"),
  });

  const createPlatform = useMutation({
    mutationFn: () => api<Platform>("/admin/platforms", {
      method: "POST",
      body: JSON.stringify({ name: newPlatform.trim(), iconUrl: pendingPlatformIcon || undefined }),
    }),
    onSuccess: (row) => {
      toast.success("Platform created");
      setForm((current) => ({ ...current, platformId: row.id, categoryId: "" }));
      setNewPlatform("");
      setPendingPlatformIcon("");
      setShowNewPlatform(false);
      qc.invalidateQueries({ queryKey: ["platforms-all"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not create platform"),
  });

  const title = screen === "success"
    ? "Service added"
    : mode === "bulk"
      ? "Add multiple services"
      : product && !duplicate
        ? "Edit service"
        : duplicate
          ? "Duplicate service"
          : "Add new service";

  return (
    <Modal open title={title} onClose={onClose} size="xl">
      {screen === "success" && created ? (
        <SuccessPanel
          product={created}
          onAddAnother={() => {
            setForm((current) => ({
              ...initialForm(null, platforms, categories, false),
              platformId: current.platformId,
              categoryId: current.categoryId,
              serviceType: current.serviceType,
              providerId: current.providerId,
            }));
            setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
            setScreen("form");
            setMode(startBulk ? "bulk" : "quick");
          }}
          onView={() => {
            if (onViewProduct) onViewProduct(created);
            else onClose();
          }}
          onDone={onClose}
        />
      ) : (
        <>
          {isNew && (
            <div className="mb-5 flex flex-wrap gap-2">
              <ModeTab active={mode === "quick"} onClick={() => setMode("quick")}>Quick Add Service</ModeTab>
              <ModeTab active={mode === "advanced"} onClick={() => setMode("advanced")}>Advanced Add Service</ModeTab>
              <ModeTab active={mode === "bulk"} onClick={() => setMode("bulk")}>Add Multiple Services</ModeTab>
            </div>
          )}

          {mode === "bulk" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-900 dark:bg-brand-950/40">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectWithAdd
                    label="Platform"
                    value={form.platformId}
                    onChange={changePlatform}
                    options={platforms.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select a platform"
                    addLabel="+ New Platform"
                    onAdd={() => setShowNewPlatform((v) => !v)}
                  />
                  <SelectWithAdd
                    label="Category"
                    value={form.categoryId}
                    onChange={(value) => set("categoryId", value)}
                    options={visibleCategories.map((c) => ({ value: c.id, label: publicCategoryName(c.name) }))}
                    placeholder="Select a category"
                    addLabel="+ New Category"
                    onAdd={() => setShowNewCategory((v) => !v)}
                  />
                </div>
                <CreatePanels
                  showNewPlatform={showNewPlatform}
                  showNewCategory={showNewCategory}
                  newPlatform={newPlatform}
                  newCategory={newCategory}
                  platformId={form.platformId}
                  platforms={platforms}
                  onPlatformName={setNewPlatform}
                  onCategoryName={setNewCategory}
                  onCreatePlatform={() => newPlatform.trim().length >= 2 && createPlatform.mutate()}
                    onCreateCategory={() => newCategory.trim().length >= 2 && createCategory.mutate()}
                  />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="bg-brand-50 text-brand-800 dark:bg-brand-950/50 dark:text-brand-200">
                      {["Service name", "Price (GHS)", "Min", "Max", "Refill", ""].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row) => (
                      <tr key={row.key} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-2"><Input value={row.name} onChange={(e) => setBulkRows((rows) => rows.map((item) => item.key === row.key ? { ...item, name: e.target.value } : item))} placeholder="Instagram Followers 1K" /></td>
                        <td className="p-2"><Input type="number" step="0.01" value={row.price} onChange={(e) => setBulkRows((rows) => rows.map((item) => item.key === row.key ? { ...item, price: e.target.value } : item))} placeholder="25" /></td>
                        <td className="p-2"><Input type="number" value={row.min} onChange={(e) => setBulkRows((rows) => rows.map((item) => item.key === row.key ? { ...item, min: e.target.value } : item))} /></td>
                        <td className="p-2"><Input type="number" value={row.max} onChange={(e) => setBulkRows((rows) => rows.map((item) => item.key === row.key ? { ...item, max: e.target.value } : item))} /></td>
                        <td className="p-2">
                          <select className="input" value={row.refill} onChange={(e) => setBulkRows((rows) => rows.map((item) => item.key === row.key ? { ...item, refill: e.target.value as "yes" | "no" } : item))}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        </td>
                        <td className="p-2"><button className="text-sm font-semibold text-rose-600" onClick={() => setBulkRows((rows) => rows.filter((item) => item.key !== row.key))}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="text-sm font-semibold text-brand-700" onClick={() => setBulkRows((rows) => [...rows, emptyBulkRow()])}>+ Add row</button>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={saveBulk}>{saving ? "Saving…" : "Save all services"}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-900 dark:bg-brand-950/40">
                <h4 className="mb-3 text-sm font-bold text-brand-800 dark:text-brand-200">Service details</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="label">{digital ? "Product name" : "Service name"}</span>
                    <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Instagram Followers 1K" />
                  </label>
                  <SelectWithAdd
                    label="Platform"
                    value={form.platformId}
                    onChange={changePlatform}
                    options={platforms.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select a platform"
                    addLabel="+ New Platform"
                    onAdd={() => setShowNewPlatform((v) => !v)}
                  />
                  <SelectWithAdd
                    label="Category"
                    value={form.categoryId}
                    onChange={(value) => set("categoryId", value)}
                    options={visibleCategories.map((c) => ({ value: c.id, label: publicCategoryName(c.name) }))}
                    placeholder="Select a category"
                    addLabel="+ New Category"
                    onAdd={() => setShowNewCategory((v) => !v)}
                  />
                  <CreatePanels
                    showNewPlatform={showNewPlatform}
                    showNewCategory={showNewCategory}
                    newPlatform={newPlatform}
                    newCategory={newCategory}
                    platformId={form.platformId}
                    platforms={platforms}
                    onPlatformName={setNewPlatform}
                    onCategoryName={setNewCategory}
                    onCreatePlatform={() => newPlatform.trim().length >= 2 && createPlatform.mutate()}
                    onCreateCategory={() => newCategory.trim().length >= 2 && createCategory.mutate()}
                    onUploadPlatformIcon={async (file) => {
                      const body = new FormData();
                      body.append("file", file);
                      const result = await api<{ url: string }>("/admin/uploads", { method: "POST", body });
                      setPendingPlatformIcon(result.url);
                      toast.success("Icon uploaded");
                    }}
                  />
                  <OrderSelect
                    label="Service type"
                    value={form.serviceType}
                    onChange={(value) => changeServiceType(value as ServiceType)}
                    placeholder="Manual Service"
                    clearable={false}
                    options={SERVICE_TYPE_OPTIONS}
                  />
                  {showProvider && (
                    <OrderSelect
                      label="Provider"
                      value={form.providerId}
                      onChange={(value) => set("providerId", value)}
                      placeholder="Manual service"
                      options={(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                    />
                  )}
                  {form.serviceType === "api" && form.providerId && (mode === "advanced" || advancedOpen) && (
                    <>
                      <label className="block"><span className="label">Provider service ID</span><Input value={form.providerServiceId} onChange={(e) => set("providerServiceId", e.target.value)} /></label>
                      <label className="block"><span className="label">Provider cost (GHS)</span><Input type="number" step="0.01" value={form.costPer1000} onChange={(e) => {
                        const cost = Number(e.target.value);
                        setForm((current) => ({ ...current, costPer1000: cost, pricePer1000: current.pricePer1000 || sellFromCost(cost, current.markupPercent) }));
                      }} /></label>
                    </>
                  )}
                  <label className="block">
                    <span className="label">Price (GHS)</span>
                    <Input type="number" step="0.01" value={form.pricePer1000} onChange={(e) => set("pricePer1000", Number(e.target.value))} placeholder="25.00" />
                    <span className="mt-1 block text-xs text-slate-500">{perUnit ? "Charged per 1 item." : "Charged per 1,000. Qty 100 of ₵25 costs ₵2.50."}</span>
                  </label>
                  {digital && (
                    <label className="block">
                      <span className="label">Stock</span>
                      <Input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value === "" ? "" : Number(e.target.value))} />
                    </label>
                  )}
                  {showQty && (
                    <>
                      <label className="block"><span className="label">Minimum</span><Input type="number" value={form.minQuantity} onChange={(e) => set("minQuantity", Number(e.target.value))} /></label>
                      <label className="block"><span className="label">Maximum</span><Input type="number" value={form.maxQuantity} onChange={(e) => set("maxQuantity", Number(e.target.value))} /></label>
                    </>
                  )}
                  {showRefill && (
                    <OrderSelect
                      label="Refill"
                      value={form.refillSupported ? "yes" : "no"}
                      onChange={(value) => set("refillSupported", value === "yes")}
                      placeholder="No"
                      clearable={false}
                      options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]}
                    />
                  )}
                  {form.refillSupported && showRefill && (
                    <label className="block">
                      <span className="label">Refill days</span>
                      <Input type="number" value={form.refillDays} onChange={(e) => set("refillDays", Number(e.target.value))} />
                    </label>
                  )}
                  {digital && (
                    <>
                      <OrderSelect
                        label="Delivery method"
                        value={form.deliveryMethod}
                        onChange={(value) => set("deliveryMethod", value)}
                        placeholder="Choose delivery"
                        options={[
                          { value: "instant", label: "Instant" },
                          { value: "email", label: "Email" },
                          { value: "whatsapp", label: "WhatsApp" },
                          { value: "download", label: "Download" },
                        ]}
                      />
                      <label className="block sm:col-span-2">
                        <span className="label">Product image</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
                          <label className="btn cursor-pointer border border-slate-200 bg-white text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
                            Upload
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "imageUrl")} />
                          </label>
                        </div>
                      </label>
                    </>
                  )}
                  <OrderSelect
                    label="Status"
                    value={form.status}
                    onChange={(value) => set("status", value)}
                    placeholder="Active"
                    clearable={false}
                    options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
                  />
                  <label className="block sm:col-span-2">
                    <span className="label">Description</span>
                    <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What the customer receives…" />
                  </label>
                  {(form.serviceType === "manual" || form.serviceType === "other" || form.serviceType === "account" || form.serviceType === "subscription") && (
                    <label className="block sm:col-span-2">
                      <span className="label">Order instructions</span>
                      <p className="mb-1.5 text-xs text-slate-500">Shown to the customer when they place the order. Optional.</p>
                      <Textarea value={form.orderInstructions} onChange={(e) => set("orderInstructions", e.target.value)} placeholder="Send WhatsApp number or email…" />
                    </label>
                  )}
                </div>
              </div>

              {(mode === "advanced" || advancedOpen) && (
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm font-bold text-brand-800 dark:text-brand-200">Advanced settings</p>
                  <p className="mt-1 text-xs text-slate-500">Filled automatically for Quick Add. Change only if you need to.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" checked={form.priceUnit === "each"} onChange={(e) => set("priceUnit", e.target.checked ? "each" : "per_1000")} />
                      Charge this price per 1 (not per 1,000)
                    </label>
                    <label className="block"><span className="label">Provider cost (GHS)</span><Input type="number" step="0.01" value={form.costPer1000} onChange={(e) => set("costPer1000", Number(e.target.value))} /></label>
                    <label className="block"><span className="label">Your percent %</span><Input type="number" step="0.1" value={form.markupPercent} onChange={(e) => {
                      const percent = Number(e.target.value);
                      setForm((current) => ({ ...current, markupPercent: percent, pricePer1000: current.costPer1000 ? sellFromCost(current.costPer1000, percent) : current.pricePer1000 }));
                    }} /></label>
                    <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950/40 sm:col-span-2">
                      Profit: <strong className="text-emerald-700">{money(round4(form.pricePer1000 - form.costPer1000))}</strong>
                    </div>
                    <label className="block"><span className="label">Reseller price (GHS)</span><Input type="number" step="0.01" value={form.resellerPricePer1000} onChange={(e) => set("resellerPricePer1000", Number(e.target.value))} /></label>
                    <label className="block"><span className="label">Child panel / API price (GHS)</span><Input type="number" step="0.01" value={form.apiPricePer1000} onChange={(e) => set("apiPricePer1000", Number(e.target.value))} /></label>
                    {form.refillSupported && (
                      <>
                        <label className="block"><span className="label">Maximum refills</span><Input type="number" value={form.refillLimit} onChange={(e) => set("refillLimit", Number(e.target.value))} /></label>
                        <label className="block"><span className="label">Provider refill ID</span><Input value={form.refillServiceId} onChange={(e) => set("refillServiceId", e.target.value)} /></label>
                        <label className="block sm:col-span-2"><span className="label">Refill instructions</span><Textarea value={form.refillInstructions} onChange={(e) => set("refillInstructions", e.target.value)} /></label>
                      </>
                    )}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.resellerAvailable} onChange={(e) => set("resellerAvailable", e.target.checked)} /> Visible to resellers</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.apiAvailable} onChange={(e) => set("apiAvailable", e.target.checked)} /> Visible on API</label>
                    <label className="block sm:col-span-2"><span className="label">Internal notes</span><Textarea value={form.features} onChange={(e) => set("features", e.target.value)} placeholder="Not shown to customers unless used as extra bullets." /></label>
                  </div>
                </div>
              )}

              {mode === "quick" && (
                <button type="button" className="flex items-center gap-1 text-sm font-semibold text-brand-700" onClick={() => setAdvancedOpen((v) => !v)}>
                  <ChevronDown className={`h-4 w-4 transition ${advancedOpen ? "rotate-180" : ""}`} />
                  Advanced settings
                </button>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                {isNew && <Button variant="outline" disabled={saving} onClick={() => save(true)}>Save & add another</Button>}
                <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={() => save(false)}>
                  {saving ? "Saving…" : isNew ? "Add service" : "Save service"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-brand-700 text-white" : "bg-white text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50 dark:bg-slate-900 dark:text-brand-100"}`}
    >
      {children}
    </button>
  );
}

function SelectWithAdd({
  label,
  value,
  onChange,
  options,
  placeholder,
  addLabel,
  onAdd,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div>
      <OrderSelect label={label} value={value} onChange={onChange} options={options} placeholder={placeholder} leadingCheck={label === "Platform"} clearable={false} />
      <button type="button" onClick={onAdd} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
        <Plus className="h-3.5 w-3.5" /> {addLabel.replace(/^\+\s*/, "")}
      </button>
    </div>
  );
}

function CreatePanels({
  showNewPlatform,
  showNewCategory,
  newPlatform,
  newCategory,
  platformId,
  platforms,
  onPlatformName,
  onCategoryName,
  onCreatePlatform,
  onCreateCategory,
  onUploadPlatformIcon,
}: {
  showNewPlatform: boolean;
  showNewCategory: boolean;
  newPlatform: string;
  newCategory: string;
  platformId: string;
  platforms: Platform[];
  onPlatformName: (value: string) => void;
  onCategoryName: (value: string) => void;
  onCreatePlatform: () => void;
  onCreateCategory: () => void;
  onUploadPlatformIcon?: (file: File) => void;
}) {
  if (!showNewPlatform && !showNewCategory) return null;
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      {showNewPlatform && (
        <div className="rounded-2xl border border-brand-200 bg-white p-3 dark:bg-slate-900">
          <p className="text-sm font-semibold text-brand-800">New platform</p>
          <label className="mt-2 block"><span className="label">Platform name</span><Input value={newPlatform} onChange={(e) => onPlatformName(e.target.value)} placeholder="Snapchat" /></label>
          {onUploadPlatformIcon && (
            <label className="mt-2 block text-xs font-semibold text-brand-700">
              Icon
              <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => e.target.files?.[0] && onUploadPlatformIcon(e.target.files[0])} />
            </label>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onCreatePlatform}>Create</Button>
          </div>
        </div>
      )}
      {showNewCategory && (
        <div className="rounded-2xl border border-brand-200 bg-white p-3 dark:bg-slate-900">
          <p className="text-sm font-semibold text-brand-800">New category</p>
          <label className="mt-2 block"><span className="label">Category name</span><Input value={newCategory} onChange={(e) => onCategoryName(e.target.value)} placeholder="Instagram Followers" /></label>
          <p className="mt-2 text-xs text-slate-500">Platform: {platforms.find((p) => p.id === platformId)?.name || "current selection"}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onCreateCategory}>Create</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SuccessPanel({
  product,
  onAddAnother,
  onView,
  onDone,
}: {
  product: Product;
  onAddAnother: () => void;
  onView: () => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <div>
        <p className="text-lg font-bold text-brand-800 dark:text-brand-200">Service added successfully</p>
        <p className="mt-1 font-semibold">{product.name}</p>
        <p className="mt-2 text-sm text-slate-500">
          Service ID: {serviceNoLabel(product)} · Price: {money(product.price_per_1000)} · Status: {product.status}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onAddAnother}>Add another</Button>
        <Button variant="outline" onClick={onView}>View service</Button>
        <Button variant="ghost" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

export function QuickCell({
  display,
  value,
  type = "text",
  options,
  onSave,
}: {
  display: React.ReactNode;
  value: string | number;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);

  const commit = async (next = draft) => {
    if (String(next) === String(value)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(String(next));
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className="rounded-lg px-1 py-0.5 text-left hover:bg-brand-50 dark:hover:bg-slate-800" onClick={() => { setDraft(String(value)); setEditing(true); }}>
        {display}
      </button>
    );
  }
  if (type === "select" && options) {
    return (
      <select
        autoFocus
        className="input h-9 py-0 text-sm"
        value={draft}
        disabled={busy}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setEditing(false)}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  return (
    <input
      autoFocus
      className="input h-9 py-0 text-sm"
      type={type}
      value={draft}
      disabled={busy}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
