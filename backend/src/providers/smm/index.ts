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

export interface SmmProviderAdapter {
  name: string;
  createOrder(input: SmmOrderInput, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmOrderResult>;
  getStatus(providerOrderId: string, credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmStatusResult>;
  getBalance(credentials: { apiUrl?: string; apiKey?: string }): Promise<number>;
  listServices(credentials: { apiUrl?: string; apiKey?: string }): Promise<SmmService[]>;
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
      { service: "1001", name: "Mock Followers", type: "Default", category: "Demo", rate: "0.90", min: "50", max: "10000" },
      { service: "1002", name: "Mock Likes", type: "Default", category: "Demo", rate: "0.40", min: "20", max: "50000" },
    ];
  },
};

/**
 * Generic HTTP SMM panel adapter (PerfectPanel / resellersmm.com /api/v2).
 * Live provider keys will be added later from Admin → Providers. Do not hard-code keys here.
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
    const json = await panelRequest<{ balance?: string; error?: string }>(credentials, { action: "balance" });
    if (json.error) throw new Error(json.error);
    return Number(json.balance ?? 0);
  },
  async listServices(credentials) {
    if (!credentials.apiUrl || !credentials.apiKey) return mockSmmAdapter.listServices(credentials);
    const json = await panelRequest<SmmService[] | { error?: string }>(credentials, { action: "services" });
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
      refill: Boolean(row.refill),
      cancel: Boolean(row.cancel),
    }));
  },
};

async function panelRequest<T>(credentials: { apiUrl?: string; apiKey?: string }, extra: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ key: credentials.apiKey || "", ...extra });
  const response = await fetch(String(credentials.apiUrl), { method: "POST", body });
  return (await response.json()) as T;
}

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
