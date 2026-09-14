import { getUsdToGhsRate } from "./currency";

export type KorapayMarket = {
  country: string;
  countryCode: string;
  currency: string;
  currencyName: string;
  methods: string;
  channels: string[];
  defaultChannel: string;
  usdPerUnit: number | null;
};

export const KORAPAY_MARKETS: KorapayMarket[] = [
  { country: "Ghana", countryCode: "GH", currency: "GHS", currencyName: "Ghanaian cedi", methods: "Mobile Money", channels: ["mobile_money"], defaultChannel: "mobile_money", usdPerUnit: null },
  { country: "Nigeria", countryCode: "NG", currency: "NGN", currencyName: "Nigerian naira", methods: "Card, bank transfer, Pay with Bank", channels: ["card", "bank_transfer", "pay_with_bank"], defaultChannel: "card", usdPerUnit: 0.00062 },
  { country: "Kenya", countryCode: "KE", currency: "KES", currencyName: "Kenyan shilling", methods: "Mobile Money", channels: ["mobile_money"], defaultChannel: "mobile_money", usdPerUnit: 0.0077 },
  { country: "Cameroon", countryCode: "CM", currency: "XAF", currencyName: "Central African CFA", methods: "Mobile Money", channels: ["mobile_money"], defaultChannel: "mobile_money", usdPerUnit: 0.0017 },
  { country: "Côte d'Ivoire", countryCode: "CI", currency: "XOF", currencyName: "West African CFA", methods: "Mobile Money", channels: ["mobile_money"], defaultChannel: "mobile_money", usdPerUnit: 0.0017 },
  { country: "Egypt", countryCode: "EG", currency: "EGP", currencyName: "Egyptian pound", methods: "Mobile Money", channels: ["mobile_money"], defaultChannel: "mobile_money", usdPerUnit: 0.021 },
  { country: "Tanzania", countryCode: "TZ", currency: "TZS", currencyName: "Tanzanian shilling", methods: "Mobile Money", channels: ["mobile_money"], defaultChannel: "mobile_money", usdPerUnit: 0.00038 },
  { country: "South Africa", countryCode: "ZA", currency: "ZAR", currencyName: "South African rand", methods: "Instant EFT", channels: ["pay_with_bank"], defaultChannel: "pay_with_bank", usdPerUnit: 0.055 },
  { country: "International (USD)", countryCode: "US", currency: "USD", currencyName: "US dollar", methods: "Virtual bank account", channels: ["bank_transfer"], defaultChannel: "bank_transfer", usdPerUnit: 1 },
];

const STORAGE_KEY = "lwh-korapay-currency";

export function filterKorapayMarkets(enabled?: string[] | null) {
  if (!enabled?.length) return KORAPAY_MARKETS;
  const allow = new Set(enabled.map((code) => code.toUpperCase()));
  const next = KORAPAY_MARKETS.filter((item) => allow.has(item.currency));
  return next.length ? next : KORAPAY_MARKETS;
}

export function readStoredKorapayCurrency() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function storeKorapayCurrency(code: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, code);
}

export function pickKorapayMarket(markets: KorapayMarket[], preferred?: string | null) {
  const code = String(preferred || readStoredKorapayCurrency() || "GHS").toUpperCase();
  return markets.find((item) => item.currency === code) ?? markets.find((item) => item.currency === "GHS") ?? markets[0];
}

export function convertGhsToKorapay(amountGhs: number, currency: string, usdToGhs = getUsdToGhsRate()) {
  const amount = Math.max(0, Number(amountGhs) || 0);
  if (currency === "GHS") return Number(amount.toFixed(2));
  const market = KORAPAY_MARKETS.find((item) => item.currency === currency);
  if (!market || market.usdPerUnit == null) return Number(amount.toFixed(2));
  const rate = Number.isFinite(usdToGhs) && usdToGhs > 0 ? usdToGhs : 15.4;
  const ghsPerUnit = rate * market.usdPerUnit;
  return Number((ghsPerUnit > 0 ? amount / ghsPerUnit : amount).toFixed(2));
}
