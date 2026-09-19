import type { KorapayStandardCheckout } from "@/types";

export type { KorapayStandardCheckout };

const SCRIPT_SRC = "https://korablobstorage.blob.core.windows.net/modal-bucket/korapay-collections.min.js";

declare global {
  interface Window {
    Korapay?: {
      initialize: (options: Record<string, unknown>) => void;
      close?: () => void;
    };
  }
}

function loadKorapayScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Korapay?.initialize) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Korapay checkout")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Korapay checkout"));
    document.head.appendChild(script);
  });
}

export async function openKorapayCheckout(checkout: KorapayStandardCheckout) {
  await loadKorapayScript();
  const korapay = window.Korapay;
  if (!korapay?.initialize) {
    throw new Error("Korapay checkout is not available in this browser.");
  }
  return new Promise<"success" | "failed" | "closed">((resolve) => {
    let settled = false;
    const done = (status: "success" | "failed" | "closed") => {
      if (settled) return;
      settled = true;
      resolve(status);
    };
    korapay.initialize({
      key: checkout.key,
      reference: checkout.reference,
      amount: checkout.amount,
      currency: checkout.currency,
      customer: {
        name: checkout.customerName,
        email: checkout.customerEmail,
      },
      notification_url: checkout.notificationUrl,
      narration: checkout.narration,
      merchant_bears_cost: checkout.merchantBearsCost,
      ...(checkout.channels?.length ? { channels: checkout.channels } : {}),
      ...(checkout.defaultChannel ? { default_channel: checkout.defaultChannel } : {}),
      ...(checkout.metadata ? { metadata: checkout.metadata } : {}),
      onSuccess: () => done("success"),
      onFailed: () => done("failed"),
      onClose: () => done("closed"),
    });
  });
}
