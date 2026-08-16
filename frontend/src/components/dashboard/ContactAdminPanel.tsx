import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Input, Textarea } from "@/components/ui";
import type { Product } from "@/types";
import { publicProductName } from "@/utils/catalog";

export function isContactAdminProduct(product?: Product | null) {
  return Boolean(product?.contact_admin);
}

export function ContactAdminPanel({ product }: { product: Product }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(String(product.min_quantity || 1));
  const [details, setDetails] = useState("");

  useEffect(() => {
    setQuantity(String(product.min_quantity || 1));
    setDetails("");
  }, [product.id, product.min_quantity]);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ whatsappUrl?: string | null; message?: string }>(`/products/${product.id}/contact-admin`, {
        method: "POST",
        body: JSON.stringify({ quantity: Number(quantity) || product.min_quantity || 1, details: details.trim() || undefined }),
      }),
    onSuccess: (data) => {
      toast.success(data.message || "Admin has been notified");
      if (data.whatsappUrl) window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
      else if (me) navigate("/app/support");
      else navigate("/login");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not contact admin"),
  });

  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
      <div className="rounded-2xl bg-brand-50 p-4 text-sm dark:bg-slate-800">
        <p className="font-semibold text-brand-800 dark:text-brand-300">Contact admin for {publicProductName(product.name)}</p>
        <p className="mt-1 text-muted">
          This is a manual service from us, not a provider order. Message admin on WhatsApp for Netflix, verification numbers, accounts, and similar items.
        </p>
      </div>
      <label className="block">
        <span className="label">Quantity</span>
        <Input type="number" min={product.min_quantity} max={product.max_quantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Details (number, username, or what you need)</span>
        <Textarea placeholder="WhatsApp number, TikTok username, dating profile, or anything admin should know" value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <Button className="h-12 w-full text-base" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Contacting…" : me ? "Contact admin" : "Contact admin on WhatsApp"}
      </Button>
    </div>
  );
}
