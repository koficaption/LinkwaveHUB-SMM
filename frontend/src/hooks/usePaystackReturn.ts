import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";

export function checkoutReturnUrl(path: string) {
  return `${window.location.origin}${path}`;
}

async function refreshAfterPayment(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["wallet"] }),
    qc.invalidateQueries({ queryKey: ["me"] }),
    qc.invalidateQueries({ queryKey: ["tx"] }),
    qc.invalidateQueries({ queryKey: ["reseller-upgrade"] }),
    qc.invalidateQueries({ queryKey: ["notifications"] }),
  ]);
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
            ? "Korapay payment received. Your account is now a reseller."
            : "Wallet funded. Korapay credited your balance automatically."
        );
        await refreshAfterPayment(qc);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof ApiError ? error.message : "Could not confirm Korapay payment");
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

/** Poll Korapay until webhook/return-URL credits the payment. Does not toast unpaid attempts. */
export function usePendingKorapayVerify(references: Array<string | null | undefined>) {
  const qc = useQueryClient();
  const refs = [...new Set(references.filter((value): value is string => Boolean(value)))].sort();
  const key = refs.join("|");

  useEffect(() => {
    if (!refs.length) return;
    let cancelled = false;
    let done = false;
    const tick = async () => {
      if (cancelled || done) return;
      for (const reference of refs) {
        try {
          const result = await api<{ purpose?: string }>("/payments/verify", {
            method: "POST",
            body: JSON.stringify({ reference }),
          });
          if (cancelled) return;
          done = true;
          toast.success(
            result.purpose === "reseller_upgrade"
              ? "Korapay payment received. Your account is now a reseller."
              : "Wallet funded. Korapay credited your balance automatically."
          );
          await refreshAfterPayment(qc);
          return;
        } catch {
          // Still unpaid or webhook has not landed yet.
        }
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, 8000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [qc, key]);
}
