-- LinkWaveHub SMM — core schema (Supabase / PostgreSQL)
-- Developed by OB CodeLab

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'reseller', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'suspended', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_type AS ENUM ('instant', 'gradual', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending', 'processing', 'in_progress', 'completed',
    'partial', 'cancelled', 'refunded', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'deposit', 'order_payment', 'refund', 'admin_adjustment', 'reseller_commission'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reseller_status AS ENUM ('pending', 'active', 'suspended', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provider_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  role            user_role NOT NULL DEFAULT 'customer',
  status          user_status NOT NULL DEFAULT 'active',
  avatar_url      TEXT,
  last_login_at   TIMESTAMPTZ,
  last_login_ip   TEXT,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- ---------------------------------------------------------------------------
-- Platforms (admin-managed, never hard-coded in the UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platforms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT,
  icon_url    TEXT,
  color       TEXT NOT NULL DEFAULT '#0D9488',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platforms_active ON platforms (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Categories (unlimited, admin-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_categories (
  platform_id UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (platform_id, category_id)
);

-- ---------------------------------------------------------------------------
-- Providers (API credentials stay on the server — never sent to the client)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  api_url             TEXT,
  api_key_encrypted   TEXT,
  adapter             TEXT NOT NULL DEFAULT 'mock',
  status              provider_status NOT NULL DEFAULT 'active',
  balance             NUMERIC(14, 4) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'GHS',
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Products (fully dynamic catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id             UUID NOT NULL REFERENCES platforms(id) ON DELETE RESTRICT,
  category_id             UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  provider_id             UUID REFERENCES providers(id) ON DELETE SET NULL,
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL UNIQUE,
  description             TEXT,
  min_quantity            INTEGER NOT NULL DEFAULT 100 CHECK (min_quantity > 0),
  max_quantity            INTEGER NOT NULL DEFAULT 100000 CHECK (max_quantity >= min_quantity),
  price_per_1000          NUMERIC(14, 4) NOT NULL CHECK (price_per_1000 >= 0),
  cost_per_1000           NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (cost_per_1000 >= 0),
  reseller_price_per_1000 NUMERIC(14, 4) CHECK (reseller_price_per_1000 IS NULL OR reseller_price_per_1000 >= 0),
  status                  product_status NOT NULL DEFAULT 'active',
  delivery_type           delivery_type NOT NULL DEFAULT 'gradual',
  avg_delivery_time       TEXT,
  provider_service_id     TEXT,
  image_url               TEXT,
  features                JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_platform ON products (platform_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '')));

-- ---------------------------------------------------------------------------
-- Wallets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance      NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency     TEXT NOT NULL DEFAULT 'GHS',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            transaction_type NOT NULL,
  amount          NUMERIC(14, 4) NOT NULL,
  balance_after   NUMERIC(14, 4) NOT NULL,
  reference       TEXT,
  description     TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON wallet_transactions (type);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           TEXT NOT NULL UNIQUE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  reseller_id         UUID,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  target              TEXT NOT NULL,
  charge              NUMERIC(14, 4) NOT NULL,
  cost                NUMERIC(14, 4) NOT NULL DEFAULT 0,
  profit              NUMERIC(14, 4) NOT NULL DEFAULT 0,
  reseller_profit     NUMERIC(14, 4) NOT NULL DEFAULT 0,
  status              order_status NOT NULL DEFAULT 'pending',
  provider_id         UUID REFERENCES providers(id) ON DELETE SET NULL,
  provider_order_id   TEXT,
  start_count         INTEGER,
  remains             INTEGER,
  admin_note          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_reseller ON orders (reseller_id);

CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL,
  unit_price  NUMERIC(14, 4) NOT NULL,
  total       NUMERIC(14, 4) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status   order_status NOT NULL,
  note        TEXT,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Payments (provider-agnostic)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_methods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  adapter     TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  method_id       UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  amount          NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'GHS',
  status          payment_status NOT NULL DEFAULT 'pending',
  reference       TEXT NOT NULL UNIQUE,
  provider_ref    TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

-- ---------------------------------------------------------------------------
-- Resellers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resellers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status          reseller_status NOT NULL DEFAULT 'pending',
  store_name      TEXT NOT NULL,
  store_slug      TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  brand_color     TEXT NOT NULL DEFAULT '#0D9488',
  tagline         TEXT,
  custom_domain   TEXT,
  markup_percent  NUMERIC(8, 2) NOT NULL DEFAULT 20,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reseller_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id     UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  selling_price   NUMERIC(14, 4) NOT NULL CHECK (selling_price >= 0),
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (reseller_id, product_id)
);

ALTER TABLE orders
  ADD CONSTRAINT orders_reseller_id_fkey
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Support
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id   TEXT NOT NULL UNIQUE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  priority    ticket_priority NOT NULL DEFAULT 'medium',
  status      ticket_status NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets (status);

CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  is_staff    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info',
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read);

-- ---------------------------------------------------------------------------
-- Settings (key/value — admin editable, no frontend hard-coding)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'platforms', 'categories', 'providers', 'products',
    'wallets', 'orders', 'payment_methods', 'payments', 'resellers',
    'support_tickets'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated ON %I;
       CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
