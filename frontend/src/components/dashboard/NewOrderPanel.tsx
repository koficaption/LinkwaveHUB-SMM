import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Category, LoyaltyMe, Paginated, Platform, Product } from "@/types";
import { Button, EmptyState, Input, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { RefillBadge } from "@/components/dashboard/RefillBadge";
import { CancelBadge } from "@/components/dashboard/CancelBadge";
import { productCancel } from "@/utils/cancel";
import { ServiceDescription } from "@/components/dashboard/ServiceDescription";
import { InstagramFollowersNotice } from "@/components/dashboard/InstagramFollowersNotice";
import { FilterSelect, ServiceCatalogFilters } from "@/components/dashboard/ServiceCatalogFilters";
import { productRefill } from "@/utils/refill";
import { publicProductName, isEachPrice, orderTotal, priceUnitSuffix } from "@/utils/catalog";

export function NewOrderPanel() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const platforms = useQuery({ queryKey: ["platforms"], queryFn: () => api<Platform[]>("/platforms") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const canLoadServices = Boolean(platformId && categoryId) || Boolean(debounced);
  const products = useQuery({
    queryKey: ["order-products", platformId, categoryId, debounced],
    queryFn: () =>
      api<Paginated<Product>>(
        `/products?limit=2000&page=1&sort=catalog${platformId ? `&platformId=${platformId}` : ""}${categoryId ? `&categoryId=${categoryId}` : ""}${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`
      ),
    enabled: canLoadServices,
  });
  const loyalty = useQuery({
    queryKey: ["loyalty-me"],
    queryFn: () => api<LoyaltyMe>("/loyalty/me"),
    enabled: me?.user.role === "customer" && !me.panel,
  });

  const visibleProducts = [...(products.data?.items ?? [])]
    .filter((p) => {
      if (platformId && p.platform_id !== platformId) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      return true;
    })
    .sort((a, b) => publicProductName(a.name).localeCompare(publicProductName(b.name)));

  const selected = visibleProducts.find((p) => p.id === productId);
  const unit = Number(selected?.display_price_per_1000 ?? selected?.price_per_1000 ?? 0);
  const qty = Number(quantity || selected?.min_quantity || 0);
  const each = isEachPrice(selected);
  const total = selected ? orderTotal(unit, qty, each ? "each" : "per_1000") : 0;

  useEffect(() => {
    if (selected) setQuantity(String(selected.min_quantity));
  }, [selected?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      api("/orders", {
        method: "POST",
        body: JSON.stringify({
          productId: selected?.id,
          quantity: qty,
          target,
          storeSlug: me?.panel?.store_slug,
        }),
      }),
    onSuccess: async () => {
      toast.success("Order placed successfully");
      setTarget("");
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["my-orders"] });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not place order"),
  });

  function serviceLabel(p: Product) {
    const sid = p.provider_service_id || p.id.slice(0, 8);
    return `[${sid}] — ${publicProductName(p.name)} | ${money(p.display_price_per_1000 ?? p.price_per_1000)} ${priceUnitSuffix(p)}`;
  }

  return (
    <section className="card p-5 sm:p-6">
      <ServiceCatalogFilters
        search={search}
        platform={platformId}
        category={categoryId}
        platforms={platforms.data ?? []}
        categories={categories.data ?? []}
        useIds
        showCounts
        onSearchChange={setSearch}
        onPlatform={(value) => {
          setPlatformId(value);
          setCategoryId("");
          setProductId("");
        }}
        onCategory={(value) => {
          setCategoryId(value);
          setProductId("");
        }}
      />

      <label className="mt-3 block">
        <span className="sr-only">Services</span>
        {products.isLoading ? (
          <Skeleton className="h-12 rounded-3xl" />
        ) : (
          <FilterSelect
            value={productId}
            onChange={setProductId}
            label="Services"
            disabled={!canLoadServices}
          >
            <option value="">{canLoadServices ? "Select a service" : "Select a platform and category"}</option>
            {visibleProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {serviceLabel(p)}
              </option>
            ))}
          </FilterSelect>
        )}
        {!products.isLoading && canLoadServices && visibleProducts.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            {visibleProducts.length.toLocaleString()}
            {products.data && products.data.total > visibleProducts.length
              ? ` of ${products.data.total.toLocaleString()}`
              : ""}{" "}
            services
            {products.data && products.data.total > visibleProducts.length
              ? ". Search to find the rest."
              : "."}
          </p>
        )}
        {!products.isLoading && canLoadServices && visibleProducts.length === 0 && (
          <p className="mt-2 text-sm text-muted">No services match that search or category.</p>
        )}
      </label>

      <div className="mt-4 space-y-3">
        <InstagramFollowersNotice product={selected} />
        <div>
          <span className="label">Description</span>
          <ServiceDescription product={selected} />
        </div>
      </div>

      {selected && (
        <form
          className="mt-5 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800"
          onSubmit={(e) => {
            e.preventDefault();
            if (qty < selected.min_quantity || qty > selected.max_quantity) {
              toast.error(`Quantity must be between ${selected.min_quantity.toLocaleString()} and ${selected.max_quantity.toLocaleString()}`);
              return;
            }
            if (target.trim().length < 3) {
              toast.error("Enter a valid profile, post, or link");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted">
              Min {selected.min_quantity.toLocaleString()} · Max {selected.max_quantity.toLocaleString()}
              {selected.avg_delivery_time ? ` · ${selected.avg_delivery_time}` : ""}
            </p>
            <RefillBadge {...productRefill(selected)} />
            <CancelBadge supported={productCancel(selected).supported} />
          </div>
          <label className="block">
            <span className="label">Target / Link</span>
            <Input placeholder="https://..." value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{each ? "Quantity (packages)" : "Quantity"}</span>
            <Input type="number" min={selected.min_quantity} max={selected.max_quantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <div className="grid gap-3 rounded-2xl bg-brand-50 p-4 text-sm dark:bg-slate-800 sm:grid-cols-2">
            <p>
              <span className="text-muted">Price</span><br />
              <strong>{money(unit)} {each ? "per 1" : "per 1,000"}</strong>
            </p>
            <p><span className="text-muted">Current Balance</span><br /><strong>{me?.wallet ? money(me.wallet.available_balance ?? me.wallet.balance) : "—"}</strong></p>
            <p><span className="text-muted">Estimated Delivery</span><br /><strong>{selected.avg_delivery_time || "—"}</strong></p>
            <p><span className="text-muted">Total</span><br /><strong className="text-lg text-brand-700">{money(total)}</strong></p>
            <p className="sm:col-span-2 text-xs text-muted">
              {each
                ? `${money(unit)} per 1 × ${qty.toLocaleString()} = ${money(total)}. Quantity 1 costs ${money(unit)}, not ${money(unit / 1000)}.`
                : `${money(unit)} per 1,000 × ${qty.toLocaleString()} = ${money(total)}.`}
            </p>
            {me?.user.role === "customer" && !me.panel && (loyalty.data?.discountPercent ?? 0) > 0 && (
              <p className="sm:col-span-2 text-brand-800 dark:text-brand-300">
                {loyalty.data?.current.name} {loyalty.data?.discountPercent}% off is already included in this price.
              </p>
            )}
          </div>
          <Button className="h-12 w-full text-base uppercase tracking-wide" disabled={mutation.isPending}>
            {mutation.isPending ? "Placing order…" : "Place order"}
          </Button>
        </form>
      )}

      {!selected && !products.isLoading && canLoadServices && visibleProducts.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No services found" body="Try another category or search term." />
        </div>
      )}
    </section>
  );
}
