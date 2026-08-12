export type Role = "customer" | "reseller" | "admin";

export type User = {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: Role;
  status: string;
  avatar_url?: string | null;
  last_login_at?: string | null;
  created_at: string;
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
  product_count?: number;
  platform_ids?: string[];
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
  channels?: ChannelLink[];
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
  };
};
