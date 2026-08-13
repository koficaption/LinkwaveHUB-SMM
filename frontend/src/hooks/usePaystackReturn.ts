import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";

export function checkoutReturnUrl(path: string) {
  return `${window.location.origin}${path}`;
}

export function usePaystackReturn() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const reference = params.get("reference") || params.get("trxref");
  const [verifying, setVerifying] = useState(Boolean(reference));

  useEffect(() => {
    if (!reference) {
      setVerifying(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await api<{ purpose?: string }>("/payments/verify", {
          method: "POST",
          body: JSON.stringify({ reference }),
        });
        if (cancelled) return;
        toast.success(
          result.purpose === "reseller_upgrade"
            ? "Card payment received. Your account is now a reseller."
            : "Wallet funded successfully."
        );
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["wallet"] }),
          qc.invalidateQueries({ queryKey: ["me"] }),
          qc.invalidateQueries({ queryKey: ["tx"] }),
          qc.invalidateQueries({ queryKey: ["reseller-upgrade"] }),
          qc.invalidateQueries({ queryKey: ["notifications"] }),
        ]);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof ApiError ? error.message : "Could not confirm Paystack payment");
        }
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(params);
          next.delete("reference");
          next.delete("trxref");
          setParams(next, { replace: true });
          setVerifying(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc, params, reference, setParams]);

  return { verifying };
}
