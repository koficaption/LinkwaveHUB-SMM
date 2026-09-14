import type { PaymentAdapter, PaymentInitInput, PaymentInitResult, PaymentVerifyResult } from "./types.js";
import { AppError } from "../../errors.js";
import { config } from "../../config.js";
import { decryptSecret, looksEncrypted } from "../../utils.js";

function resolveKorapaySecret(cfg?: Record<string, unknown>) {
  const raw = String(cfg?.secretKey || process.env.KORAPAY_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY || "");
  if (!raw) return "";
  if (looksEncrypted(raw)) {
    try {
      return decryptSecret(raw);
    } catch {
      return "";
    }
  }
  return raw;
}

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
  parts.push(`Use your unique code ${reference} as the payment note, then wait for admin to confirm. The amount will then appear in your wallet.`);
  return parts.join(" ");
}

export const manualAdapter: PaymentAdapter = {
  code: "manual",
  async initialize(input: PaymentInitInput): Promise<PaymentInitResult> {
    const note = input.customerReference || input.reference;
    return {
      reference: input.reference,
      instructions: manualInstructions(input.config, input.amount, note),
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
    const secret = resolveKorapaySecret(input.config);
    if (!secret) {
      throw new AppError("Automatic Korapay checkout is not configured. Add KORAPAY_SECRET_KEY on the server.", 503);
    }
    const quote = input.feeQuote;
    const chargeAmount = Number((quote?.chargedAmount ?? input.amount).toFixed(2));
    const walletAmount = Number((quote?.walletAmount ?? input.amount).toFixed(2));
    const currency = String(input.currency || "GHS").toUpperCase();
    const merchantBearsCost = input.merchantBearsCost !== false;
    const metadata = korapayMetadata(input.metadata);
    const notificationUrl = `${config.frontendUrl.replace(/\/$/, "")}/api/payments/webhooks/korapay`;
    const walletGhs = Number(input.metadata?.walletAmountGhs ?? walletAmount);
    const payload = {
      amount: chargeAmount,
      currency,
      reference: input.reference,
      redirect_url: input.callbackUrl || undefined,
      notification_url: notificationUrl,
      narration: `LinkBoost Growth SMM wallet GHS ${Number(walletGhs).toFixed(2)}`,
      merchant_bears_cost: merchantBearsCost,
      customer: {
        email: input.email,
        name: input.customerName || input.email.split("@")[0],
      },
      metadata,
    };
    const withChannels = input.channels?.length
      ? { ...payload, channels: input.channels, default_channel: input.defaultChannel || input.channels[0] }
      : payload;
    let json = await korapayInitialize(secret, withChannels);
    if ((!json?.status || !json.data?.checkout_url) && input.channels?.length) {
      json = await korapayInitialize(secret, payload);
    }
    if (!json?.status || !json.data?.checkout_url) {
      throw new AppError(json?.message || "Korapay could not start checkout for this country. Enable that currency on your Korapay dashboard.", 400);
    }
    const extras = quote && quote.chargedAmount > quote.walletAmount
      ? ` Korapay fee ${currency} ${quote.fee.toFixed(2)} + tax ${currency} ${quote.vat.toFixed(2)} are included. You pay ${currency} ${chargeAmount.toFixed(2)}.`
      : "";
    return {
      reference: json.data.reference || input.reference,
      checkoutUrl: json.data.checkout_url,
      providerRef: json.data.reference || input.reference,
      instructions: `Complete payment on Korapay.${extras} Your wallet is credited in GHS after Korapay confirms.`,
    };
  },
  async verify(reference: string, cfg?: Record<string, unknown>): Promise<PaymentVerifyResult> {
    const secret = resolveKorapaySecret(cfg);
    if (!secret) return { success: false, reference };
    const response = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}`, "User-Agent": "LinkBoostGrowth/1.0" } }
    );
    const json = (await response.json()) as {
      status: boolean;
      data?: {
        status?: string;
        amount?: number | string;
        amount_charged?: number | string;
        fee?: number | string;
        vat?: number | string;
        reference?: string;
      };
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

type KorapayInitJson = {
  status: boolean;
  message: string;
  data?: { checkout_url?: string; reference?: string; fee?: number | string; vat?: number | string };
};

async function korapayInitialize(secret: string, body: Record<string, unknown>): Promise<KorapayInitJson | null> {
  const response = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "User-Agent": "LinkBoostGrowth/1.0",
    },
    body: JSON.stringify(body),
  });
  try {
    return (await response.json()) as KorapayInitJson;
  } catch {
    return { status: false, message: `Korapay returned HTTP ${response.status}` };
  }
}

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
