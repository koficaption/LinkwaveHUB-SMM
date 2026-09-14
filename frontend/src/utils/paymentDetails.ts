import type { PaymentMethod } from "@/types";

type PaymentConfig = PaymentMethod["config"] | Record<string, unknown> | undefined;

function configText(cfg: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!cfg) return "";
  for (const key of keys) {
    const value = cfg[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function normalizeManualPaymentConfig(cfg?: PaymentConfig) {
  const raw = (cfg ?? {}) as Record<string, unknown>;
  return {
    network: configText(raw, "network", "momo_network", "momoNetwork"),
    momoNumber: configText(raw, "momoNumber", "momo_number", "walletNumber"),
    accountName: configText(raw, "accountName", "account_name", "momo_name", "momoName"),
    bankName: configText(raw, "bankName", "bank_name"),
    accountNumber: configText(raw, "accountNumber", "account_number"),
    instructions: configText(raw, "instructions", "note", "notes"),
  };
}

export function hasManualPaymentDetails(cfg?: PaymentConfig) {
  const details = normalizeManualPaymentConfig(cfg);
  return Boolean(
    details.network
    || details.momoNumber
    || details.accountName
    || details.bankName
    || details.accountNumber
    || details.instructions
  );
}

export function isManualPaymentMethod(adapter?: string | null) {
  return String(adapter || "").toLowerCase() === "manual";
}
