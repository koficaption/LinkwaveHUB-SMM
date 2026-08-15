export type Role = "customer" | "reseller" | "admin";

export type Gender = "male" | "female";

export type User = {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  whatsapp_number?: string | null;
  gender?: Gender | null;
  role: Role;
  status: string;
  avatar_url?: string | null;
  last_login_at?: string | null;
  created_at: string;
};

export type PanelStore = {
  id: string;
  store_name: string;
  store_slug: string;
  logo_url?: string | null;
  brand_color: string;
  tagline?: string | null;
  markup_percent?: number | string;
  status?: string;
  support_email?: string | null;
  contact_phone?: string | null;
  whatsapp_number?: string | null;
  profit_balance?: number | string;
};

export type Wallet = {
  id: string;
  user_id: string;
  balance: number | string;
  currency: string;
  total_deposits?: number;
  total_spent?: number;
  available_balance?: number;
};

export type Platform = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  icon_url?: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  product_count?: number;
  categories?: Category[];
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  is_active: boolean;
  sort_order: number;
  product_count?: number;
  platform_ids?: string[];
  platform_counts?: Record<string, number>;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  min_quantity: number;
  max_quantity: number;
  price_per_1000: number | string;
  cost_per_1000?: number | string;
  reseller_price_per_1000?: number | string | null;
  display_price_per_1000?: number | string;
  profit_per_1000?: number | string;
  status: "active" | "inactive";
  delivery_type: string;
  avg_delivery_time?: string | null;
  provider_service_id?: string | null;
  image_url?: string | null;
  features: string[];
  platform_id: string;
  category_id: string;
  provider_id?: string | null;
  platform_name: string;
  platform_slug: string;
  platform_icon?: string | null;
  platform_color?: string;
  category_name: string;
  category_slug: string;
  provider_name?: string | null;
  created_at: string;
  updated_at: string;
  refill_supported?: boolean;
  refill_days?: number;
  refill_type?: string | null;
  refill_service_id?: string | null;
  refill_instructions?: string | null;
  refill_limit?: number;
  provider_refill_supported?: boolean;
  reseller_available?: boolean;
  api_available?: boolean;
  api_price_per_1000?: number | string | null;
  api_min_quantity?: number | null;
  api_max_quantity?: number | null;
  loyalty_discount_percent?: number;
  price_unit?: "per_1000" | "each";
};

export type RefillSummary = {
  eligible: boolean;
  reasons: string[];
  display: string;
  refillSupported: boolean;
  refillDays: number;
  maxRefills: number;
  used: number;
  expiresAt: string;
  providerRefillSupported: boolean;
  productName?: string;
};

export type RefillRecord = {
  id: string;
  public_id: string;
  order_id: string;
  order_public_id?: string;
  user_id?: string;
  product_id?: string;
  status: string;
  provider_refill_id?: string | null;
  provider_name?: string | null;
  product_name?: string;
  platform_name?: string;
  customer_name?: string;
  customer_email?: string;
  target?: string;
  quantity?: number;
  requested_at?: string;
  processing_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  expires_at?: string | null;
  error_message?: string | null;
  admin_note?: string | null;
  created_at: string;
  updated_at?: string;
};

export type RefillOverview = {
  total: number;
  requested: number;
  processing: number;
  completed: number;
  failed: number;
  expired: number;
  today: number;
};

export type Order = {
  id: string;
  public_id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  target: string;
  charge: number | string;
  cost?: number | string;
  profit?: number | string;
  status: string;
  product_name: string;
  platform_name: string;
  platform_color?: string;
  platform_icon?: string | null;
  category_name: string;
  customer_name: string;
  customer_email: string;
  provider_name?: string | null;
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
  start_count?: number | null;
  remains?: number | null;
  provider_order_id?: string | null;
  refill?: RefillSummary;
  history?: { id: string; from_status: string | null; to_status: string; note?: string | null; created_at: string; actor_name?: string }[];
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type LoyaltyTierId = "none" | "new" | "frequent" | "vip";

export type LoyaltyTier = {
  id: LoyaltyTierId;
  name: string;
  minSpendGhs: number;
  minSpendUsd: number;
  discountPercent: number;
  benefits: string[];
};

export type LoyaltyMe = {
  spent: number;
  tier: LoyaltyTierId;
  current: LoyaltyTier;
  next: LoyaltyTier | null;
  remaining: number;
  progressPercent: number;
  discountPercent: number;
  childPanelFree: boolean;
  childPanelClaimed: boolean;
  lotteryUsd: number;
  lotteryGhs: number;
  lastLottery: {
    name?: string;
    amount?: number;
    lotteryUsd?: number;
    drawnAt?: string;
  } | null;
  tiers: LoyaltyTier[];
};

export type ChannelLink = {
  name: string;
  url: string;
  kind?: string;
};

export type PublicSettings = {
  siteName?: string;
  tagline?: string;
  supportEmail?: string;
  contactPhone?: string;
  whatsappNumber?: string;
  developer?: string;
  currency?: string;
  logoUrl?: string;
  usdToGhs?: number;
  channels?: ChannelLink[];
  affiliates?: {
    enabled?: boolean;
    commissionPercent?: number;
    minimumPayout?: number;
  };
  payments?: {
    korapayCustomerPaysFees?: boolean;
    korapayFeePercent?: number;
    korapayVatPercent?: number;
  };
  resellers?: {
    upgradeEnabled?: boolean;
    upgradeFee?: number;
    upgradeNote?: string;
  };
};

export type PaymentMethod = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  adapter: string;
  is_enabled?: boolean;
  config?: {
    network?: string;
    momoNumber?: string;
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    instructions?: string;
    publicKey?: string;
    customerPaysFees?: boolean;
    feePercent?: number;
    vatPercent?: number;
  };
};
