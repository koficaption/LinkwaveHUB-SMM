const STORAGE_KEY = "lwh-display-currency";

export type DisplayCurrency = {
  code: string;
  name: string;
  symbol: string;
  /** USD value of 1 unit. GHS is computed from the admin USD→GHS rate. */
  usdPerUnit: number | null;
};

export const DISPLAY_CURRENCIES: DisplayCurrency[] = [
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", usdPerUnit: null },
  { code: "USD", name: "US Dollar", symbol: "$", usdPerUnit: 1 },
  { code: "EUR", name: "Euro", symbol: "€", usdPerUnit: 1.08 },
  { code: "GBP", name: "Pound Sterling", symbol: "£", usdPerUnit: 1.27 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", usdPerUnit: 0.00062 },
  { code: "XAF", name: "Central African CFA", symbol: "FCFA", usdPerUnit: 0.0017 },
  { code: "XOF", name: "West African CFA", symbol: "CFA", usdPerUnit: 0.0017 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", usdPerUnit: 0.0077 },
  { code: "ZAR", name: "South African Rand", symbol: "R", usdPerUnit: 0.055 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", usdPerUnit: 0.021 },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", usdPerUnit: 0.1 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", usdPerUnit: 0.00038 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", usdPerUnit: 0.00027 },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw", usdPerUnit: 0.00072 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", usdPerUnit: 0.73 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", usdPerUnit: 0.66 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", usdPerUnit: 0.6 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", usdPerUnit: 0.012 },
  { code: "AED", name: "UAE Dirham", symbol: "AED", usdPerUnit: 0.272 },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", usdPerUnit: 0.267 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", usdPerUnit: 0.14 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", usdPerUnit: 0.0067 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", usdPerUnit: 1.12 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", usdPerUnit: 0.095 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", usdPerUnit: 0.094 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", usdPerUnit: 0.145 },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", usdPerUnit: 0.25 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", usdPerUnit: 0.029 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", usdPerUnit: 0.18 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", usdPerUnit: 0.05 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", usdPerUnit: 0.017 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", usdPerUnit: 0.74 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", usdPerUnit: 0.128 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", usdPerUnit: 0.00072 },
  { code: "THB", name: "Thai Baht", symbol: "฿", usdPerUnit: 0.028 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", usdPerUnit: 0.000061 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", usdPerUnit: 0.21 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", usdPerUnit: 0.0036 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", usdPerUnit: 0.0082 },
];

const DEFAULT_USD_TO_GHS = 15.4;

let displayCode = readStoredCurrency();
let usdToGhsRate = DEFAULT_USD_TO_GHS;

export function readStoredCurrency() {
  if (typeof localStorage === "undefined") return "GHS";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && DISPLAY_CURRENCIES.some((item) => item.code === stored)) return stored;
  return "GHS";
}

export function getDisplayCurrency() {
  return displayCode;
}

export function setDisplayCurrencyState(code: string) {
  displayCode = DISPLAY_CURRENCIES.some((item) => item.code === code) ? code : "GHS";
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, displayCode);
}

export function getUsdToGhsRate() {
  return usdToGhsRate;
}

export function setUsdToGhsRate(value: number) {
  usdToGhsRate = Number.isFinite(value) && value > 0 ? value : DEFAULT_USD_TO_GHS;
}

export function getCurrency(code?: string) {
  return DISPLAY_CURRENCIES.find((item) => item.code === (code || displayCode)) ?? DISPLAY_CURRENCIES[0];
}

export function ghsPerUnit(code: string, usdToGhs = usdToGhsRate) {
  if (code === "GHS") return 1;
  const row = getCurrency(code);
  const usd = row.usdPerUnit ?? 1 / usdToGhs;
  return usdToGhs * usd;
}

export function convertFromGhs(amountGhs: number, code: string, usdToGhs = usdToGhsRate) {
  const rate = ghsPerUnit(code, usdToGhs);
  return rate > 0 ? amountGhs / rate : amountGhs;
}

export function formatCurrencyAmount(amount: number, code: string) {
  const row = getCurrency(code);
  const digits = Math.abs(amount) >= 1000 || code === "GHS" || code === "USD" || code === "EUR" || code === "GBP"
    ? 2
    : Math.abs(amount) >= 1 ? 2 : 4;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
  return `${row.symbol} ${formatted}`;
}
