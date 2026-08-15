import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/api/client";
import { storedReferralCode, claimStoredReferral } from "@/pages/customer/AffiliatePages";
import { activeStoreSlug, registerStoreSlug } from "@/utils/panel";
import { setStoredToken } from "@/api/token";
import type { PanelStore, User, Wallet } from "@/types";

type Me = {
  user: User;
  wallet: Wallet | null;
  reseller: {
    id: string;
    status: string;
    store_name: string;
    store_slug: string;
    logo_url?: string | null;
    brand_color: string;
    tagline?: string | null;
    markup_percent: number | string;
    support_email?: string | null;
    contact_phone?: string | null;
    whatsapp_number?: string | null;
    profit_balance?: number | string;
  } | null;
  panel?: PanelStore | null;
  resellerApplication?: {
    id: string;
    store_name: string;
    fee_amount: number | string;
    currency: string;
    status: string;
    created_at: string;
    payment_reference?: string | null;
    payment_status?: string | null;
  } | null;
};

type AuthContextValue = {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  loginWithGoogle: (payload: { credential?: string; code?: string; accessToken?: string }) => Promise<Me>;
  completeTokenLogin: (token: string) => Promise<Me>;
  register: (payload: Record<string, unknown>) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function finishLogin(token: string, qc: QueryClient): Promise<Me> {
  setStoredToken(token);
  const me = await api<Me>("/auth/me");
  qc.setQueryData(["me"], me);
  return me;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      me: data ?? null,
      loading: isLoading,
      async login(email, password) {
        const result = await api<{ user: User; token: string }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, storeSlug: activeStoreSlug() }),
        });
        const me = await finishLogin(result.token, qc);
        await claimStoredReferral();
        return me;
      },
      async loginWithGoogle(payload) {
        const result = await api<{ user: User; token: string }>("/auth/google", {
          method: "POST",
          body: JSON.stringify({ ...payload, referralCode: storedReferralCode(), storeSlug: activeStoreSlug() }),
        });
        const me = await finishLogin(result.token, qc);
        await claimStoredReferral();
        return me;
      },
      async completeTokenLogin(token: string) {
        const me = await finishLogin(token, qc);
        await claimStoredReferral();
        return me;
      },
      async register(payload) {
        const result = await api<{ user: User; token: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            referralCode: payload.referralCode || storedReferralCode(),
            storeSlug: payload.storeSlug || registerStoreSlug(),
          }),
        });
        const me = await finishLogin(result.token, qc);
        await claimStoredReferral();
        return me;
      },
      async logout() {
        setStoredToken(null);
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        qc.setQueryData(["me"], null);
      },
      async refresh() {
        await refetch();
      },
    }),
    [data, isLoading, qc, refetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => localStorage.getItem("lwh-theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("lwh-theme", dark ? "dark" : "light");
  }, [dark]);
  return <ThemeContext.Provider value={{ dark, setDark }}>{children}</ThemeContext.Provider>;
}

const ThemeContext = createContext<{ dark: boolean; setDark: (v: boolean) => void }>({ dark: false, setDark: () => {} });
export const useTheme = () => useContext(ThemeContext);
