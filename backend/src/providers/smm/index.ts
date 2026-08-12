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

export interface SmmProviderAdapter {
  name: string;
  createOrder(input: SmmOrderInput, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmOrderResult>;
  getStatus(providerOrderId: string, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmStatusResult>;
  getBalance(credentials: { apiUrl?: string; apiKey?: string }): Promise<number>;
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
};

/**
 * Generic HTTP SMM panel adapter (PerfectPanel / similar).
 * New providers can be added by inserting a row in `providers` with adapter = 'generic_http'.
 */
export const genericHttpAdapter: SmmProviderAdapter = {
  name: "generic_http",
  async createOrder(input, credentials) {
    if (!credentials.apiUrl || !credentials.apiKey) {
      return mockSmmAdapter.createOrder(input, credentials);
    }
    const body = new URLSearchParams({
      key: credentials.apiKey,
      action: "add",
      service: input.serviceId,
      link: input.link,
      quantity: String(input.quantity),
    });
    const response = await fetch(credentials.apiUrl, { method: "POST", body });
    const json = (await response.json()) as { order?: string | number; error?: string };
    if (json.error) throw new Error(json.error);
    return { providerOrderId: String(json.order), status: "pending", raw: json };
  },
  async getStatus(providerOrderId, credentials) {
    if (!credentials.apiUrl || !credentials.apiKey) {
      return mockSmmAdapter.getStatus(providerOrderId, credentials);
    }
    const body = new URLSearchParams({
      key: credentials.apiKey,
      action: "status",
      order: providerOrderId,
    });
    const response = await fetch(credentials.apiUrl, { method: "POST", body });
    const json = (await response.json()) as {
      status?: string;
      start_count?: string;
      remains?: string;
    };
    return {
      status: (json.status || "pending").toLowerCase().replace(/\s+/g, "_"),
      startCount: json.start_count ? Number(json.start_count) : undefined,
      remains: json.remains ? Number(json.remains) : undefined,
      raw: json,
    };
  },
  async getBalance(credentials) {
    if (!credentials.apiUrl || !credentials.apiKey) return 0;
    const body = new URLSearchParams({ key: credentials.apiKey, action: "balance" });
    const response = await fetch(credentials.apiUrl, { method: "POST", body });
    const json = (await response.json()) as { balance?: string };
    return Number(json.balance ?? 0);
  },
};

const smmAdapters: Record<string, SmmProviderAdapter> = {
  mock: mockSmmAdapter,
  generic_http: genericHttpAdapter,
};

export function getSmmAdapter(name: string): SmmProviderAdapter {
  return smmAdapters[name] ?? mockSmmAdapter;
}

export function registerSmmAdapter(name: string, adapter: SmmProviderAdapter) {
  smmAdapters[name] = adapter;
}
