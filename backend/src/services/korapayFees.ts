import { getSettings } from "./settingsService.js";

export type KorapayFeeSettings = {
  customerPaysFees: boolean;
  feePercent: number;
  vatPercent: number;
};

export type KorapayFeeQuote = KorapayFeeSettings & {
  walletAmount: number;
  fee: number;
  vat: number;
  chargedAmount: number;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function defaultKorapayFeeSettings(): KorapayFeeSettings {
  return {
    customerPaysFees: true,
    feePercent: 1.5,
    vatPercent: 15,
  };
}

export function parseKorapayFeeSettings(raw?: Record<string, unknown> | null): KorapayFeeSettings {
  const fallback = defaultKorapayFeeSettings();
  const feePercent = Number(raw?.korapayFeePercent ?? fallback.feePercent);
  const vatPercent = Number(raw?.korapayVatPercent ?? fallback.vatPercent);
  return {
    customerPaysFees: raw?.korapayCustomerPaysFees !== false,
    feePercent: Number.isFinite(feePercent) && feePercent >= 0 ? feePercent : fallback.feePercent,
    vatPercent: Number.isFinite(vatPercent) && vatPercent >= 0 ? vatPercent : fallback.vatPercent,
  };
}

export async function getKorapayFeeSettings(): Promise<KorapayFeeSettings> {
  const all = await getSettings();
  return parseKorapayFeeSettings((all.payments as Record<string, unknown> | undefined) ?? {});
}

export function quoteKorapayFees(walletAmount: number, settings: KorapayFeeSettings): KorapayFeeQuote {
  const amount = roundMoney(Math.max(0, Number(walletAmount) || 0));
  if (!settings.customerPaysFees || amount <= 0 || settings.feePercent <= 0) {
    return {
      ...settings,
      walletAmount: amount,
      fee: 0,
      vat: 0,
      chargedAmount: amount,
    };
  }
  const feeRate = settings.feePercent / 100;
  const vatRate = settings.vatPercent / 100;
  const effective = feeRate * (1 + vatRate);
  if (effective >= 0.5) {
    return {
      ...settings,
      walletAmount: amount,
      fee: 0,
      vat: 0,
      chargedAmount: amount,
    };
  }
  const chargedAmount = roundMoney(amount / (1 - effective));
  const fee = roundMoney(chargedAmount * feeRate);
  const vat = roundMoney(chargedAmount - amount - fee);
  return {
    ...settings,
    walletAmount: amount,
    fee: Math.max(0, fee),
    vat: Math.max(0, vat),
    chargedAmount,
  };
}

export function isCardPaymentAdapter(adapter: unknown) {
  const code = String(adapter || "");
  return code === "korapay" || code === "paystack" || code === "card";
}
