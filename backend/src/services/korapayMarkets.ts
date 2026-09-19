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
    methods: "Card or bank transfer",
    channels: ["card", "bank_transfer"],
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
  return ["GHS", "NGN"];
}

const ALL_KORAPAY_CURRENCIES = KORAPAY_MARKETS.map((item) => item.currency);

export function parseKorapayCurrencies(raw: unknown): string[] {
  const allowed = new Set(ALL_KORAPAY_CURRENCIES);
  const list = Array.isArray(raw)
    ? [...new Set(raw.map((item) => String(item).trim().toUpperCase()).filter((code) => allowed.has(code)))]
    : [];
  if (!list.length) return defaultKorapayCurrencies();
  // The old default ticked every Korapay country. Most merchant accounts only
  // have Ghana MoMo and Nigeria card/bank, and the extra countries produce
  // "you don't have any channel enabled for checkout payment".
  if (list.length === ALL_KORAPAY_CURRENCIES.length) return defaultKorapayCurrencies();
  return list;
}

export type KorapayChannelAttempt = { channels: string[]; defaultChannel?: string };

export function korapayInitializeAttempts(
  currency: string,
  channels?: string[],
  defaultChannel?: string
): KorapayChannelAttempt[] {
  const attempts: KorapayChannelAttempt[] = [];
  const seen = new Set<string>();
  const add = (list: string[], def?: string) => {
    const clean = [...new Set(list.filter(Boolean))];
    if (!clean.length) return;
    const nextDef = def && clean.includes(def) ? def : undefined;
    const key = `${clean.join(",")}|${nextDef || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({ channels: clean, defaultChannel: nextDef });
  };

  const requested = [...(channels || [])];
  if (requested.length) {
    add(requested, defaultChannel || requested[0]);
    add(requested);
    const withoutPayWithBank = requested.filter((item) => item !== "pay_with_bank");
    if (withoutPayWithBank.length !== requested.length) add(withoutPayWithBank, withoutPayWithBank[0]);
    for (const channel of requested) add([channel], channel);
  }

  const fallback = KORAPAY_MARKETS.find((item) => item.currency === currency)?.channels
    || ["mobile_money"];
  add(fallback, fallback[0]);
  for (const channel of fallback) add([channel], channel);
  if (currency === "NGN") {
    add(["card"], "card");
    add(["bank_transfer"], "bank_transfer");
  }
  if (currency === "GHS") add(["mobile_money"], "mobile_money");
  return attempts;
}

export function korapayChargeAmount(amount: number) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.ceil(value));
}

export function korapayCheckoutError(currency: string, message?: string) {
  const market = KORAPAY_MARKETS.find((item) => item.currency === currency);
  const text = String(message || "").trim();
  if (/channel enabled/i.test(text) || /no channel/i.test(text)) {
    const country = market?.country || currency;
    const methods = market?.methods || "that payment method";
    return `Korapay does not have ${methods} turned on for ${country} (${currency}). Pay from Ghana (Mobile Money) or Nigeria (card/bank), or ask Korapay to enable ${country} on this merchant account.`;
  }
  return text || `Korapay could not start checkout for ${currency}. Enable that currency on your Korapay dashboard.`;
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
