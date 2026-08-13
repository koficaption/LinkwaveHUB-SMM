import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import type { Category, Paginated, Platform, Product } from "@/types";
import { Button, EmptyState, Input, Skeleton } from "@/components/ui";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { useAuth } from "@/contexts/AuthContext";

export function NewOrderPanel() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
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
  const products = useQuery({
    queryKey: ["order-products", categoryId, debounced],
    queryFn: () =>
      api<Paginated<Product>>(
        `/products?limit=50&page=1${categoryId ? `&categoryId=${categoryId}` : ""}${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`
      ),
  });

  const selected = products.data?.items.find((p) => p.id === productId);
  const unit = Number(selected?.display_price_per_1000 ?? selected?.price_per_1000 ?? 0);
  const qty = Number(quantity || selected?.min_quantity || 0);
  const total = selected ? (unit * qty) / 1000 : 0;

  useEffect(() => {
    if (selected) setQuantity(String(selected.min_quantity));
  }, [selected?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      api("/orders", {
        method: "POST",
        body: JSON.stringify({ productId: selected?.id, quantity: qty, target }),
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

  const categoryOptions = useMemo(() => {
    const plats = platforms.data ?? [];
    return (categories.data ?? []).map((c) => {
      const ids = Array.isArray(c.platform_ids) ? c.platform_ids : [];
      const platform = plats.find((p) => ids.includes(p.id)) ?? plats.find((p) => p.id === ids[0]);
      return { category: c, platform };
    });
  }, [categories.data, platforms.data]);

  const selectedCategory = categoryOptions.find((c) => c.category.id === categoryId);

  function serviceLabel(p: Product) {
    const sid = p.provider_service_id || p.id.slice(0, 8);
    return `[${sid}] — ${p.name} | ${money(p.display_price_per_1000 ?? p.price_per_1000)} / 1000`;
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-700" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-12 pl-12 text-base"
          aria-label="Search services"
        />
      </div>

      <label className="mt-5 block">
        <span className="label">Category</span>
        <div className="relative">
          {selectedCategory?.platform && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <PlatformIcon name={selectedCategory.platform.icon} color={selectedCategory.platform.color} className="h-5 w-5" />
            </span>
          )}
          <select
            className={`input h-12 ${selectedCategory?.platform ? "pl-11" : ""}`}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setProductId("");
            }}
          >
            <option value="">Select a category</option>
            {categoryOptions.map(({ category, platform }) => (
              <option key={category.id} value={category.id}>
                {platform ? `${platform.name} · ${category.name}` : category.name}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className="mt-4 block">
        <span className="label">Services</span>
        {products.isLoading ? (
          <Skeleton className="h-12" />
        ) : (
          <select
            className="input h-12"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select a service</option>
            {products.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {serviceLabel(p)}
              </option>
            ))}
          </select>
        )}
        {!products.isLoading && products.data?.items.length === 0 && (
          <p className="mt-2 text-sm text-muted">No services match that search or category.</p>
        )}
      </label>

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
          <p className="text-sm text-muted">
            Min {selected.min_quantity.toLocaleString()} · Max {selected.max_quantity.toLocaleString()}
            {selected.avg_delivery_time ? ` · ${selected.avg_delivery_time}` : ""}
          </p>
          {selected.description && <p className="text-sm text-slate-600 dark:text-slate-300">{selected.description}</p>}
          <label className="block">
            <span className="label">Target / Link</span>
            <Input placeholder="https://..." value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Quantity</span>
            <Input type="number" min={selected.min_quantity} max={selected.max_quantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <div className="grid gap-3 rounded-2xl bg-brand-50 p-4 text-sm dark:bg-slate-800 sm:grid-cols-2">
            <p><span className="text-muted">Price</span><br /><strong>{money(unit)} / 1000</strong></p>
            <p><span className="text-muted">Current Balance</span><br /><strong>{me?.wallet ? money(me.wallet.available_balance ?? me.wallet.balance) : "—"}</strong></p>
            <p><span className="text-muted">Estimated Delivery</span><br /><strong>{selected.avg_delivery_time || "—"}</strong></p>
            <p><span className="text-muted">Total</span><br /><strong className="text-lg text-brand-700">{money(total)}</strong></p>
          </div>
          <Button className="h-12 w-full text-base uppercase tracking-wide" disabled={mutation.isPending}>
            {mutation.isPending ? "Placing order…" : "Place order"}
          </Button>
        </form>
      )}

      {!selected && !products.isLoading && (debounced || categoryId) && products.data?.items.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No services found" body="Try another category or search term." />
        </div>
      )}
    </section>
  );
}
