import { parsePanelFlag } from "../../services/refillParse.js";

export type SmmOrderInput = {
  serviceId: string;
  link: string;
  quantity: number;
};

export type SmmOrderResult = {
  providerOrderId: string;
  status: string;
  raw?: unknown;
};

export type SmmStatusResult = {
  status: string;
  startCount?: number;
  remains?: number;
  raw?: unknown;
};

export type SmmService = {
  service: string;
  name: string;
  type?: string;
  category?: string;
  rate?: string;
  min?: string;
  max?: string;
  refill?: boolean;
  cancel?: boolean;
};

export type SmmRefillResult = {
  refillId?: string;
  status: string;
  manual?: boolean;
  error?: string;
  raw?: unknown;
};

export interface SmmProviderAdapter {
  name: string;
  createOrder(input: SmmOrderInput, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmOrderResult>;
  getStatus(providerOrderId: string, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmStatusResult>;
  getStatuses?(providerOrderIds: string[], credentials: { apiUrl?: string; apiKey?: string }): Promise<Record<string, SmmStatusResult>>;
  getBalance(credentials: { apiUrl?: string; apiKey?: string }): Promise<number>;
  listServices(credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmService[]>;
  requestRefill?(providerOrderId: string, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmRefillResult>;
  getRefillStatus?(providerRefillId: string, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmRefillResult>;
}

export const mockSmmAdapter: SmmProviderAdapter = {
  name: "mock",
  async createOrder(input) {
    return {
      providerOrderId: `MOCK-${Date.now()}`,
      status: "pending",
      raw: input,
    };
  },
  async getStatus() {
    return { status: "processing" };
  },
  async getBalance() {
    return 10000;
  },
  async listServices() {
    return [
      { service: "1001", name: "Mock Followers", type: "Default", category: "Demo", rate: "0.90", min: "50", max: "10000", refill: true },
      { service: "1002", name: "Mock Likes", type: "Default", category: "Demo", rate: "0.40", min: "20", max: "50000" },
    ];
  },
  async requestRefill(providerOrderId) {
    return { refillId: `MOCK-RF-${Date.now()}`, status: "processing", raw: { order: providerOrderId } };
  },
  async getRefillStatus(providerRefillId) {
    return { refillId: providerRefillId, status: "completed" };
  },
};

/**
 * Generic HTTP SMM panel adapter (PerfectPanel / resellersmm.com /api/v2).
 * Live provider keys are stored encrypted in Admin → Providers. Never fall back to mock
 * when a live panel is configured — that looks successful locally and never hits the provider.
 */
export const genericHttpAdapter: SmmProviderAdapter = {
  name: "generic_http",
  async createOrder(input, credentials) {
    requireLiveCredentials(credentials);
    if (!input.serviceId || input.serviceId === "0") {
      throw new Error("This product has no provider service ID. Re-import the catalog or set the panel service ID.");
    }
    const json = await panelRequest<{ order?: string | number; error?: string }>(credentials, {
      action: "add",
      service: input.serviceId,
      link: input.link,
      quantity: String(input.quantity),
    });
    if (json.error) throw new Error(String(json.error));
    if (json.order == null || String(json.order).trim() === "") {
      throw new Error("Provider did not return an order ID");
    }
    return { providerOrderId: String(json.order), status: "pending", raw: json };
  },
  async getStatus(providerOrderId, credentials) {
    requireLiveCredentials(credentials);
    const json = await panelRequest<Record<string, unknown>>(credentials, {
      action: "status",
      order: providerOrderId,
    }, 12_000);
    if (json.error) throw new Error(String(json.error));
    return toStatusResult(json);
  },
  async getStatuses(providerOrderIds, credentials) {
    requireLiveCredentials(credentials);
    const ids = [...new Set(providerOrderIds.map(String).filter(Boolean))];
    if (!ids.length) return {};
    if (ids.length === 1) {
      return { [ids[0]]: await this.getStatus(ids[0], credentials) };
    }
    try {
      const json = await panelRequest<Record<string, unknown>>(credentials, {
        action: "status",
        orders: ids.join(","),
      }, 20_000);
      const parsed = parseStatusMap(json, ids);
      if (Object.keys(parsed).length) return parsed;
    } catch {
      /* some panels only support a single order id */
    }
    const out: Record<string, SmmStatusResult> = {};
    for (const id of ids) {
      out[id] = await this.getStatus(id, credentials);
    }
    return out;
  },
  async getBalance(credentials) {
    requireLiveCredentials(credentials);
    const json = await panelRequest<{ balance?: string; error?: string }>(credentials, { action: "balance" });
    if (json.error) throw new Error(String(json.error));
    return Number(json.balance ?? 0);
  },
  async listServices(credentials) {
    requireLiveCredentials(credentials);
    const json = await panelRequest<SmmService[] | { error?: string }>(credentials, { action: "services" }, 120_000);
    if (!Array.isArray(json)) {
      throw new Error((json as { error?: string }).error || "Provider did not return a service list");
    }
    return json.map((row) => ({
      service: String(row.service),
      name: String(row.name ?? row.service),
      type: row.type ? String(row.type) : undefined,
      category: row.category ? String(row.category) : undefined,
      rate: row.rate != null ? String(row.rate) : undefined,
      min: row.min != null ? String(row.min) : undefined,
      max: row.max != null ? String(row.max) : undefined,
      refill: parsePanelFlag(row.refill),
      cancel: Boolean(row.cancel),
    }));
  },
  async requestRefill(providerOrderId, credentials) {
    if (!credentials.apiUrl || !credentials.apiKey) {
      return { status: "requested", manual: true, error: "Provider credentials are missing. Manual refill required." };
    }
    const json = await panelRequest<{ refill?: string | number; error?: string }>(credentials, {
      action: "refill",
      order: providerOrderId,
    });
    if (json.error) {
      return { status: "failed", error: json.error, raw: json };
    }
    if (json.refill == null) {
      return { status: "requested", manual: true, error: "Provider does not support automatic refill.", raw: json };
    }
    return { refillId: String(json.refill), status: "processing", raw: json };
  },
  async getRefillStatus(providerRefillId, credentials) {
    if (!credentials.apiUrl || !credentials.apiKey) {
      return { refillId: providerRefillId, status: "processing" };
    }
    const json = await panelRequest<{ status?: string; error?: string }>(credentials, {
      action: "refill_status",
      refill: providerRefillId,
    });
    if (json.error) return { refillId: providerRefillId, status: "failed", error: json.error, raw: json };
    return {
      refillId: providerRefillId,
      status: (json.status || "processing").toLowerCase().replace(/\s+/g, "_"),
      raw: json,
    };
  },
};

function requireLiveCredentials(credentials: { apiUrl?: string; apiKey?: string }) {
  if (!credentials.apiUrl || !String(credentials.apiUrl).trim()) {
    throw new Error("Provider API URL is missing. Add it in Admin → Providers.");
  }
  if (!credentials.apiKey || !String(credentials.apiKey).trim()) {
    throw new Error("Provider API key is missing. Add it in Admin → Providers.");
  }
}

async function panelRequest<T>(
  credentials: { apiUrl?: string; apiKey?: string },
  extra: Record<string, string>,
  timeoutMs = 30_000
): Promise<T> {
  requireLiveCredentials(credentials);
  const body = new URLSearchParams({ key: credentials.apiKey as string, ...extra });
  let response: Response;
  try {
    response = await fetch(String(credentials.apiUrl), {
      method: "POST",
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    throw new Error(`Could not reach the provider API (${message})`);
  }
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Provider returned a non-JSON response (HTTP ${response.status}). Check the panel API URL.`);
  }
  return json as T;
}

function parseCount(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toStatusResult(json: Record<string, unknown>): SmmStatusResult {
  if (json.error) throw new Error(String(json.error));
  return {
    status: String(json.status || "pending").toLowerCase().replace(/\s+/g, "_"),
    startCount: parseCount(json.start_count),
    remains: parseCount(json.remains),
    raw: json,
  };
}

function parseStatusMap(json: unknown, ids: string[]): Record<string, SmmStatusResult> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const obj = json as Record<string, unknown>;
  if (typeof obj.status === "string" && ids.length === 1) {
    return { [ids[0]]: toStatusResult(obj) };
  }
  const out: Record<string, SmmStatusResult> = {};
  for (const id of ids) {
    const row = obj[id];
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const parsed = row as Record<string, unknown>;
      if (parsed.error) continue;
      out[id] = toStatusResult(parsed);
    }
  }
  return out;
}

const smmAdapters: Record<string, SmmProviderAdapter> = {
  mock: mockSmmAdapter,
  generic_http: genericHttpAdapter,
};

export function getSmmAdapter(name: string): SmmProviderAdapter {
  if (smmAdapters[name]) return smmAdapters[name];
  if (!name || name === "mock") return mockSmmAdapter;
  return genericHttpAdapter;
}

export function adapterForLiveProvider(adapterName: unknown, hasLiveCredentials: boolean): SmmProviderAdapter {
  const name = String(adapterName || "");
  if (hasLiveCredentials && (!name || name === "mock")) return genericHttpAdapter;
  return getSmmAdapter(name || (hasLiveCredentials ? "generic_http" : "mock"));
}

export function isMockProviderOrderId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("MOCK-");
}

/** Map PerfectPanel / clone statuses onto local order_status values. */
export function mapPanelOrderStatus(status: string): string | null {
  const s = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "complete", "success", "ok"].includes(s)) return "completed";
  if (s === "partial") return "partial";
  if (["in_progress", "inprogress"].includes(s)) return "in_progress";
  if (["processing", "process"].includes(s)) return "processing";
  if (["pending", "awaiting"].includes(s)) return "processing";
  if (["canceled", "cancelled"].includes(s)) return "cancelled";
  if (["refunded", "refund", "reversed"].includes(s)) return "refunded";
  if (["failed", "error", "rejected", "fail"].includes(s)) return "failed";
  return null;
}

export function registerSmmAdapter(name: string, adapter: SmmProviderAdapter) {
  smmAdapters[name] = adapter;
}
