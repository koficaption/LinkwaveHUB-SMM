export type KorapayMarket = {
  country: string;
  countryCode: string;
  currency: string;
  currencyName: string;
  methods: string;
  channels: string[];
  defaultChannel: string;
  /** USD value of 1 unit. GHS is derived from the admin USD→GHS rate. */
  usdPerUnit: number | null;
};

/** Currencies Korapay checkout can collect, with the channels they actually offer. */
export const KORAPAY_MARKETS: KorapayMarket[] = [
  {
    country: "Ghana",
    countryCode: "GH",
    currency: "GHS",
    currencyName: "Ghanaian cedi",
    methods: "Mobile Money",
    channels: ["mobile_money"],
    defaultChannel: "mobile_money",
    usdPerUnit: null,
  },
  {
    country: "Nigeria",
    countryCode: "NG",
    currency: "NGN",
    currencyName: "Nigerian naira",
    methods: "Card, bank transfer, Pay with Bank",
    channels: ["card", "bank_transfer", "pay_with_bank"],
    defaultChannel: "card",
    usdPerUnit: 0.00062,
  },
  {
    country: "Kenya",
    countryCode: "KE",
    currency: "KES",
    currencyName: "Kenyan shilling",
    methods: "Mobile Money",
    channels: ["mobile_money"],
    defaultChannel: "mobile_money",
    usdPerUnit: 0.0077,
  },
  {
    country: "Cameroon",
    countryCode: "CM",
    currency: "XAF",
    currencyName: "Central African CFA",
    methods: "Mobile Money",
    channels: ["mobile_money"],
    defaultChannel: "mobile_money",
    usdPerUnit: 0.0017,
  },
  {
    country: "Côte d'Ivoire",
    countryCode: "CI",
    currency: "XOF",
    currencyName: "West African CFA",
    methods: "Mobile Money",
    channels: ["mobile_money"],
    defaultChannel: "mobile_money",
    usdPerUnit: 0.0017,
  },
  {
    country: "Egypt",
    countryCode: "EG",
    currency: "EGP",
    currencyName: "Egyptian pound",
    methods: "Mobile Money",
    channels: ["mobile_money"],
    defaultChannel: "mobile_money",
    usdPerUnit: 0.021,
  },
  {
    country: "Tanzania",
    countryCode: "TZ",
    currency: "TZS",
    currencyName: "Tanzanian shilling",
    methods: "Mobile Money",
    channels: ["mobile_money"],
    defaultChannel: "mobile_money",
    usdPerUnit: 0.00038,
  },
  {
    country: "South Africa",
    countryCode: "ZA",
    currency: "ZAR",
    currencyName: "South African rand",
    methods: "Instant EFT",
    channels: ["pay_with_bank"],
    defaultChannel: "pay_with_bank",
    usdPerUnit: 0.055,
  },
  {
    country: "International (USD)",
    countryCode: "US",
    currency: "USD",
    currencyName: "US dollar",
    methods: "Virtual bank account",
    channels: ["bank_transfer"],
    defaultChannel: "bank_transfer",
    usdPerUnit: 1,
  },
];

export function defaultKorapayCurrencies() {
  return KORAPAY_MARKETS.map((item) => item.currency);
}

export function parseKorapayCurrencies(raw: unknown): string[] {
  const allowed = new Set(defaultKorapayCurrencies());
  const list = Array.isArray(raw)
    ? raw.map((item) => String(item).trim().toUpperCase()).filter((code) => allowed.has(code))
    : [];
  return list.length ? [...new Set(list)] : defaultKorapayCurrencies();
}

export function enabledKorapayMarkets(enabledCurrencies?: unknown) {
  const enabled = new Set(parseKorapayCurrencies(enabledCurrencies));
  return KORAPAY_MARKETS.filter((item) => enabled.has(item.currency));
}

export function getKorapayMarket(currency?: string | null, enabledCurrencies?: unknown) {
  const markets = enabledKorapayMarkets(enabledCurrencies);
  const code = String(currency || "GHS").trim().toUpperCase();
  return markets.find((item) => item.currency === code) ?? markets.find((item) => item.currency === "GHS") ?? markets[0];
}

export function ghsPerKorapayUnit(currency: string, usdToGhs: number) {
  const market = KORAPAY_MARKETS.find((item) => item.currency === currency);
  if (!market || market.currency === "GHS" || market.usdPerUnit == null) return 1;
  const rate = Number(usdToGhs);
  const usdToGhsSafe = Number.isFinite(rate) && rate > 0 ? rate : 15.4;
  return usdToGhsSafe * market.usdPerUnit;
}

export function convertGhsToKorapay(amountGhs: number, currency: string, usdToGhs: number) {
  const amount = Math.max(0, Number(amountGhs) || 0);
  if (currency === "GHS") return Number(amount.toFixed(2));
  const perUnit = ghsPerKorapayUnit(currency, usdToGhs);
  const converted = perUnit > 0 ? amount / perUnit : amount;
  return Number(converted.toFixed(2));
}
