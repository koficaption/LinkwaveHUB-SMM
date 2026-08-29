import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Product } from "@/types";
import { isEachPrice, orderTotal } from "@/utils/catalog";

export type OrderQuote = {
  productId: string;
  quantity: number;
  unitPrice: number;
  priceUnit: "each" | "per_1000";
  charge: number;
  minQuantity: number;
  maxQuantity: number;
};

export function localOrderTotal(product: Product | null | undefined, quantity: number) {
  if (!product || !Number.isFinite(quantity) || quantity <= 0) return 0;
  const unit = Number(product.display_price_per_1000 ?? product.price_per_1000 ?? 0);
  return orderTotal(unit, quantity, isEachPrice(product) ? "each" : "per_1000");
}

export function useOrderQuote(
  product: Product | null | undefined,
  quantity: number,
  opts?: { storeSlug?: string; manual?: boolean; enabled?: boolean }
) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));
  return useQuery({
    queryKey: ["order-quote", product?.id, qty, opts?.storeSlug || "", Boolean(opts?.manual)],
    queryFn: () =>
      api<OrderQuote>("/orders/quote", {
        method: "POST",
        body: JSON.stringify({
          productId: product!.id,
          quantity: qty,
          storeSlug: opts?.storeSlug || undefined,
          manual: opts?.manual || undefined,
        }),
      }),
    enabled: Boolean(product?.id) && qty >= 1 && opts?.enabled !== false,
    staleTime: 15_000,
  });
}
