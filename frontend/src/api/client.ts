import type { ApiSuccess } from "@/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | { success: false; message: string } | null;
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json && "message" in json ? json.message : "Request failed", res.status);
  }
  return json.data;
}

export const money = (value: number | string | null | undefined, currency = "GHS") => {
  const n = Number(value ?? 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
