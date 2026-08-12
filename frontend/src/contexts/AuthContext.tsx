import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/api/client";
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
};

type AuthContextValue = {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (payload: Record<string, unknown>) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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
        const me = await api<Me>("/auth/me");
        qc.setQueryData(["me"], me);
        return me;
      },
      async register(payload) {
        await api("/auth/register", { method: "POST", body: JSON.stringify(payload) });
        const me = await api<Me>("/auth/me");
        qc.setQueryData(["me"], me);
        return me;
      },
      async logout() {
        await api("/auth/logout", { method: "POST" });
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
