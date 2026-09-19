import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePublicSettings } from "@/components/ContactLinks";
import {
  DISPLAY_CURRENCIES,
  convertFromGhs,
  formatCurrencyAmount,
  getDisplayCurrency,
  setDisplayCurrencyState,
  setUsdToGhsRate,
  type DisplayCurrency,
} from "@/utils/currency";

type CurrencyContextValue = {
  code: string;
  currencies: DisplayCurrency[];
  setCode: (code: string) => void;
  usdToGhs: number;
  formatGhs: (amountGhs: number | string | null | undefined, code?: string) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const settings = usePublicSettings();
  const [code, setCodeState] = useState(getDisplayCurrency);
  const usdToGhs = Number(settings.data?.usdToGhs ?? 15.4);

  useEffect(() => {
    setUsdToGhsRate(usdToGhs);
  }, [usdToGhs]);

  const value = useMemo<CurrencyContextValue>(() => ({
    code,
    currencies: DISPLAY_CURRENCIES,
    usdToGhs,
    setCode(next) {
      setDisplayCurrencyState(next);
      setCodeState(getDisplayCurrency());
    },
    formatGhs(amountGhs, displayCode = code) {
      const ghs = Number(amountGhs ?? 0);
      return formatCurrencyAmount(convertFromGhs(ghs, displayCode, usdToGhs), displayCode);
    },
  }), [code, usdToGhs]);

  return (
    <CurrencyContext.Provider value={value}>
      <div className="contents" key={`${code}-${usdToGhs}`}>
        {children}
      </div>
    </CurrencyContext.Provider>
  );
}

export function useDisplayCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useDisplayCurrency must be used within CurrencyProvider");
  return ctx;
}
