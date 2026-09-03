import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, money, ApiError, errorMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Input, Textarea } from "@/components/ui";
import type { Product, Wallet } from "@/types";
import { isEachPrice, priceUnitSuffix } from "@/utils/catalog";
import { localOrderTotal, useOrderQuote } from "@/hooks/useOrderQuote";

export function isContactAdminProduct(product?: Product | null) {
  return Boolean(product?.contact_admin);
}

function looksLikeWhatsAppOrEmail(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function ContactAdminPanel({ product }: { product: Product }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState("1");
  const [details, setDetails] = useState("");

  useEffect(() => {
    setQuantity("1");
    setDetails("");
  }, [product.id]);

  const qty = Math.max(1, Math.floor(Number(quantity || 1) || 1));
  const each = isEachPrice(product);
  const unit = Number(product.display_price_per_1000 ?? product.price_per_1000 ?? 0);
  const quote = useOrderQuote(product, qty, { storeSlug: me?.panel?.store_slug, manual: true, enabled: Boolean(me) });
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api<Wallet>("/wallet"),
    enabled: Boolean(me),
  });
  const total = quote.data?.charge ?? localOrderTotal(product, qty);
  const balance = Number(
    wallet.data?.available_balance ?? wallet.data?.balance ?? me?.wallet?.available_balance ?? me?.wallet?.balance ?? 0
  );
  const ordersPath = me?.user.role === "admin" ? "/admin/orders" : "/app/orders";
  const short = balance + 0.0001 < total;

  const mutation = useMutation({
    mutationFn: () =>
      api<{ order?: { public_id?: string }; charge?: number; publicId?: string; message?: string }>(
        `/products/${product.id}/contact-admin`,
        {
          method: "POST",
          body: JSON.stringify({ quantity: qty, details: details.trim() }),
        }
      ),
    onSuccess: async (data) => {
      toast.success(data.message || "Order placed. Admin has your paid order.");
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      await qc.invalidateQueries({ queryKey: ["my-orders"] });
      await qc.invalidateQueries({ queryKey: ["admin-orders"] });
      navigate(ordersPath);
    },
    onError: (e) => toast.error(errorMessage(e, e instanceof ApiError ? e.message : "Could not place the order")),
  });

  async function submit() {
    if (!me) {
      navigate("/login");
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error("Enter a quantity of at least 1");
      return;
    }
    if (!looksLikeWhatsAppOrEmail(details)) {
      toast.error("Enter a WhatsApp number or email");
      return;
    }
    const fresh = await wallet.refetch();
    const liveBalance = Number(
      fresh.data?.available_balance ?? fresh.data?.balance ?? balance
    );
    const liveTotal = quote.data?.charge ?? total;
    if (liveBalance + 0.0001 < liveTotal) {
      toast.error(
        `Insufficient wallet balance. This order is ${money(liveTotal)}. You have ${money(liveBalance)}.`
      );
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
      <label className="block">
        <span className="label">Quantity</span>
        <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">WhatsApp number or email</span>
        <Textarea placeholder="WhatsApp number or email" value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <div className="grid gap-3 rounded-xl bg-brand-50 p-4 text-sm dark:bg-slate-800 sm:grid-cols-2">
        <p>
          <span className="text-muted">Price</span><br />
          <strong>{money(quote.data?.unitPrice ?? unit)} {quote.data?.priceUnit === "per_1000" ? "/ 1,000" : priceUnitSuffix(product)}</strong>
        </p>
        <p>
          <span className="text-muted">Current Balance</span><br />
          <strong>{me?.wallet || wallet.data ? money(balance) : "—"}</strong>
        </p>
        <p className="sm:col-span-2">
          <span className="text-muted">Total</span><br />
          <strong className="text-lg text-brand-700">{money(total)}</strong>
        </p>
        {each || quote.data?.priceUnit === "each" ? (
          <p className="sm:col-span-2 text-xs text-muted">
            {money(quote.data?.unitPrice ?? unit)} per 1 × {qty.toLocaleString()} = {money(total)}.
          </p>
        ) : null}
      </div>
      {me && short && (
        <p className="text-sm text-rose-600">
          Not enough balance.{" "}
          <Link className="font-semibold text-brand-700" to="/app/wallet">Add funds</Link>
        </p>
      )}
      <Button className="h-12 w-full text-base uppercase tracking-wide" disabled={mutation.isPending} onClick={() => void submit()}>
        {mutation.isPending ? "Placing order…" : me ? "Place order" : "Login to order"}
      </Button>
    </div>
  );
}
