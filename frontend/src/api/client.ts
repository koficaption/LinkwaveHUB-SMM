import type { ApiSuccess } from "@/types";
import { getStoredToken } from "@/api/token";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", "Bearer " + token);
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | { success: false; message: string; details?: unknown } | null;
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json && "message" in json ? json.message : "Request failed", res.status, json && "details" in json ? json.details : undefined);
  }
  return json.data;
}

export function errorMessage(error: unknown, fallback = "Request failed") {
  if (!(error instanceof ApiError)) return fallback;
  if (Array.isArray(error.details)) {
    const parts = error.details
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as { path?: string; message?: string };
        return row.message || "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(". ");
  }
  return error.message || fallback;
}

export const money = (value: number | string | null | undefined, currency = "GHS") => {
  const n = Number(value ?? 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
