import type { PaymentAdapter, PaymentInitInput, PaymentInitResult, PaymentVerifyResult } from "./types.js";

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

export const paystackAdapter: PaymentAdapter = {
  code: "paystack",
  async initialize(input: PaymentInitInput): Promise<PaymentInitResult> {
    const secret = (input.config?.secretKey as string) || process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return {
        reference: input.reference,
        instructions:
          "Paystack is enabled but not configured. Add a secret key in Admin → Settings → Payments.",
        autoComplete: false,
      };
    }
    const amountKobo = Math.round(input.amount * 100);
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: amountKobo,
        reference: input.reference,
        currency: input.currency === "GHS" ? "GHS" : "GHS",
        metadata: input.metadata ?? {},
      }),
    });
    const json = (await response.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; reference: string };
    };
    if (!json.status || !json.data) {
      throw new Error(json.message || "Paystack initialization failed");
    }
    return {
      reference: json.data.reference,
      checkoutUrl: json.data.authorization_url,
      providerRef: json.data.reference,
    };
  },
  async verify(reference: string, cfg?: Record<string, unknown>): Promise<PaymentVerifyResult> {
    const secret = (cfg?.secretKey as string) || process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { success: false, reference };
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = (await response.json()) as {
      status: boolean;
      data?: { status: string; amount: number; reference: string; id: number };
    };
    return {
      success: Boolean(json.status && json.data?.status === "success"),
      reference,
      providerRef: json.data ? String(json.data.id) : null,
      amount: json.data ? json.data.amount / 100 : undefined,
      raw: json.data,
    };
  },
};

const adapters: Record<string, PaymentAdapter> = {
  mock: mockAdapter,
  manual: manualAdapter,
  paystack: paystackAdapter,
  card: paystackAdapter,
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

// Korapay (instant card + bank / manual) will be added here when the website is complete.
// Do not hard-code Korapay keys in the frontend.
