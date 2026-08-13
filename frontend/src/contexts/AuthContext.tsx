import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/api/client";
import { storedReferralCode } from "@/pages/customer/AffiliatePages";
import { setStoredToken } from "@/api/token";
import type { User, Wallet } from "@/types";

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
  } | null;
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
          body: JSON.stringify({ email, password }),
        });
        return finishLogin(result.token, qc);
      },
      async loginWithGoogle(payload) {
        const result = await api<{ user: User; token: string }>("/auth/google", {
          method: "POST",
          body: JSON.stringify({ ...payload, referralCode: storedReferralCode() }),
        });
        return finishLogin(result.token, qc);
      },
      async completeTokenLogin(token: string) {
        return finishLogin(token, qc);
      },
      async register(payload) {
        const result = await api<{ user: User; token: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ ...payload, referralCode: payload.referralCode || storedReferralCode() }),
        });
        return finishLogin(result.token, qc);
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
  const [dark, setDark] = useState(() => localStorage.getItem("lwh-theme") !== "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("lwh-theme", dark ? "dark" : "light");
  }, [dark]);
  return <ThemeContext.Provider value={{ dark, setDark }}>{children}</ThemeContext.Provider>;
}

const ThemeContext = createContext<{ dark: boolean; setDark: (v: boolean) => void }>({ dark: false, setDark: () => {} });
export const useTheme = () => useContext(ThemeContext);
