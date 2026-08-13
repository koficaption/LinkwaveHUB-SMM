import type { PaymentAdapter, PaymentInitInput, PaymentInitResult, PaymentVerifyResult } from "./types.js";
import { AppError } from "../../errors.js";

export const mockAdapter: PaymentAdapter = {
  code: "mock",
  async initialize(input: PaymentInitInput): Promise<PaymentInitResult> {
    return {
      reference: input.reference,
      checkoutUrl: null,
      instructions: "Demo wallet top-up. Funds are credited immediately in development.",
      autoComplete: true,
    };
  },
  async verify(reference: string): Promise<PaymentVerifyResult> {
    return { success: true, reference };
  },
};

function manualInstructions(config: Record<string, unknown> | undefined, amount: number, reference: string) {
  const network = String(config?.network ?? "").trim();
  const momo = String(config?.momoNumber ?? "").trim();
  const accountName = String(config?.accountName ?? "").trim();
  const bankName = String(config?.bankName ?? "").trim();
  const accountNumber = String(config?.accountNumber ?? "").trim();
  const extra = String(config?.instructions ?? "").trim();
  const parts = [`Send GHS ${amount.toFixed(2)}.`];
  if (network || momo) {
    parts.push(`${network || "Mobile Money"}: ${momo || "number not set"}${accountName ? ` (${accountName})` : ""}`);
  }
  if (bankName || accountNumber) {
    parts.push(`Bank: ${[bankName, accountNumber, accountName].filter(Boolean).join(" · ")}`);
  }
  if (extra) parts.push(extra);
  parts.push(`Use reference ${reference} as the payment note, then wait for admin confirmation.`);
  return parts.join(" ");
}

export const manualAdapter: PaymentAdapter = {
  code: "manual",
  async initialize(input: PaymentInitInput): Promise<PaymentInitResult> {
    return {
      reference: input.reference,
      instructions: manualInstructions(input.config, input.amount, input.reference),
      autoComplete: false,
    };
  },
  async verify(reference: string): Promise<PaymentVerifyResult> {
    return { success: false, reference };
  },
};

export const korapayAdapter: PaymentAdapter = {
  code: "korapay",
  async initialize(input: PaymentInitInput): Promise<PaymentInitResult> {
    const secret = (input.config?.secretKey as string) || process.env.KORAPAY_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return {
        reference: input.reference,
        instructions:
          "Korapay is enabled but not configured. Add KORAPAY_SECRET_KEY to the server environment.",
        autoComplete: false,
      };
    }
    const metadata = korapayMetadata(input.metadata);
    const response = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "User-Agent": "LinkBoostGrowth/1.0",
      },
      body: JSON.stringify({
        amount: Number(input.amount.toFixed(2)),
        currency: input.currency || "GHS",
        reference: input.reference,
        redirect_url: input.callbackUrl || undefined,
        narration: `LinkBoost Growth SMM ${input.amount.toFixed(2)} ${input.currency || "GHS"}`,
        channels: ["card", "bank_transfer", "mobile_money"],
        default_channel: "card",
        customer: {
          email: input.email,
          name: input.customerName || input.email.split("@")[0],
        },
        metadata,
      }),
    });
    const json = (await response.json()) as {
      status: boolean;
      message: string;
      data?: { checkout_url?: string; reference?: string };
    };
    if (!json.status || !json.data?.checkout_url) {
      throw new AppError(json.message || "Korapay initialization failed", 400);
    }
    return {
      reference: json.data.reference || input.reference,
      checkoutUrl: json.data.checkout_url,
      providerRef: json.data.reference || input.reference,
      instructions: "Complete payment on the Korapay checkout page. Your wallet updates after Korapay confirms.",
    };
  },
  async verify(reference: string, cfg?: Record<string, unknown>): Promise<PaymentVerifyResult> {
    const secret = (cfg?.secretKey as string) || process.env.KORAPAY_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { success: false, reference };
    const response = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}`, "User-Agent": "LinkBoostGrowth/1.0" } }
    );
    const json = (await response.json()) as {
      status: boolean;
      data?: { status?: string; amount?: number | string; reference?: string };
    };
    const amount = json.data?.amount == null ? undefined : Number(json.data.amount);
    return {
      success: Boolean(json.status && json.data?.status === "success"),
      reference,
      providerRef: json.data?.reference ?? reference,
      amount,
      raw: json.data,
    };
  },
};

function korapayMetadata(meta?: Record<string, unknown>) {
  if (!meta) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    const safeKey = key.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
    if (!safeKey || value == null || value === "") continue;
    out[safeKey] = String(value).slice(0, 120);
    if (Object.keys(out).length >= 5) break;
  }
  return Object.keys(out).length ? out : undefined;
}

const adapters: Record<string, PaymentAdapter> = {
  mock: mockAdapter,
  manual: manualAdapter,
  korapay: korapayAdapter,
  paystack: korapayAdapter,
  card: korapayAdapter,
  momo: manualAdapter,
};

export function getPaymentAdapter(code: string): PaymentAdapter {
  const adapter = adapters[code];
  if (!adapter) {
    throw new Error(`Unknown payment adapter: ${code}`);
  }
  return adapter;
}

export function registerPaymentAdapter(code: string, adapter: PaymentAdapter) {
  adapters[code] = adapter;
}
