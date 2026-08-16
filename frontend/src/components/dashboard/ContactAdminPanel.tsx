import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, money, ApiError } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Input, Textarea } from "@/components/ui";
import type { Product } from "@/types";
import { publicProductName, isEachPrice, orderTotal, priceUnitSuffix } from "@/utils/catalog";

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

  const unit = Number(product.display_price_per_1000 ?? product.price_per_1000 ?? 0);
  const qty = Number(quantity || 1);
  const each = isEachPrice(product);
  const total = orderTotal(unit, qty, each ? "each" : "per_1000");
  const balance = Number(me?.wallet?.available_balance ?? me?.wallet?.balance ?? 0);
  const ordersPath = me?.user.role === "admin" ? "/admin/orders" : "/app/orders";

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
      toast.success(data.message || "Paid. Admin has your order.");
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      await qc.invalidateQueries({ queryKey: ["my-orders"] });
      await qc.invalidateQueries({ queryKey: ["admin-orders"] });
      navigate(ordersPath);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not place the order"),
  });

  function submit() {
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
    if (balance < total) {
      toast.error("Insufficient wallet balance. Add funds first.");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
      <div className="rounded-xl bg-brand-50 p-4 text-sm dark:bg-slate-800">
        <p className="font-semibold text-brand-800 dark:text-brand-300">Contact admin for {publicProductName(product.name)}</p>
        <p className="mt-1 text-muted">
          This is a manual service from us, not a provider order. Paying deducts your wallet and sends the order to admin.
        </p>
      </div>
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
          <strong>{money(unit)} {priceUnitSuffix(product)}</strong>
        </p>
        <p>
          <span className="text-muted">Current Balance</span><br />
          <strong>{me?.wallet ? money(balance) : "—"}</strong>
        </p>
        <p className="sm:col-span-2">
          <span className="text-muted">Total</span><br />
          <strong className="text-lg text-brand-700">{money(total)}</strong>
        </p>
      </div>
      {me && balance < total && (
        <p className="text-sm text-rose-600">
          Not enough balance.{" "}
          <Link className="font-semibold text-brand-700" to="/app/wallet">Add funds</Link>
        </p>
      )}
      <Button className="h-12 w-full text-base" disabled={mutation.isPending} onClick={submit}>
        {mutation.isPending ? "Paying…" : me ? "Contact admin" : "Sign in to buy"}
      </Button>
    </div>
  );
}
