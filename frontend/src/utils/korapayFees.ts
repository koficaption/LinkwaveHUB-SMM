export type KorapayFeeConfig = {
  customerPaysFees?: boolean;
  feePercent?: number;
  vatPercent?: number;
};

export type KorapayFeeQuote = {
  wallet: number;
  fee: number;
  vat: number;
  total: number;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function quoteKorapayFees(amount: number, cfg?: KorapayFeeConfig | null): KorapayFeeQuote {
  const wallet = roundMoney(Math.max(0, Number(amount) || 0));
  const feePercent = Number(cfg?.feePercent ?? 1.5);
  const vatPercent = Number(cfg?.vatPercent ?? 15);
  if (!cfg || cfg.customerPaysFees === false || wallet <= 0 || !(feePercent > 0)) {
    return { wallet, fee: 0, vat: 0, total: wallet };
  }
  const feeRate = feePercent / 100;
  const vatRate = vatPercent / 100;
  const effective = feeRate * (1 + vatRate);
  if (effective >= 0.5) return { wallet, fee: 0, vat: 0, total: wallet };
  const total = roundMoney(wallet / (1 - effective));
  const fee = roundMoney(total * feeRate);
  const vat = roundMoney(total - wallet - fee);
  return { wallet, fee: Math.max(0, fee), vat: Math.max(0, vat), total };
}
