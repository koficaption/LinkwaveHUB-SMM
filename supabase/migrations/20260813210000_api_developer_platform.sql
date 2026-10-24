-- API Developer Platform
-- One catalog/order/wallet system; API is an access channel, not a second product stack.
-- RLS is enabled so the Supabase Data API cannot read hashed keys or webhook secrets.
-- The Express API connects as the table owner and bypasses RLS.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS api_price_per_1000 NUMERIC(14, 4)
    CHECK (api_price_per_1000 IS NULL OR api_price_per_1000 >= 0),
  ADD COLUMN IF NOT EXISTS api_min_quantity INTEGER
    CHECK (api_min_quantity IS NULL OR api_min_quantity > 0),
  ADD COLUMN IF NOT EXISTS api_max_quantity INTEGER
    CHECK (api_max_quantity IS NULL OR api_max_quantity > 0);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS api_key_id UUID;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_source_check
    CHECK (source IN ('dashboard', 'api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_source ON orders (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_api_key ON orders (api_key_id);

DO $$ BEGIN
  CREATE TYPE api_developer_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE api_key_status AS ENUM ('active', 'revoked', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE api_plan AS ENUM ('free', 'reseller', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS api_developers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status                   api_developer_status NOT NULL DEFAULT 'pending',
  plan                     api_plan NOT NULL DEFAULT 'free',
  applicant_name           TEXT NOT NULL,
  applicant_email          TEXT NOT NULL,
  company_name             TEXT,
  website_url              TEXT,
  intended_usage           TEXT,
  expected_monthly_requests INTEGER,
  rate_limit_per_minute    INTEGER NOT NULL DEFAULT 100 CHECK (rate_limit_per_minute > 0 AND rate_limit_per_minute <= 20000),
  allowed_ips              TEXT[] NOT NULL DEFAULT '{}',
  admin_note               TEXT,
  reviewed_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_developers_status ON api_developers (status);
CREATE INDEX IF NOT EXISTS idx_api_developers_plan ON api_developers (plan);

CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id    UUID NOT NULL REFERENCES api_developers(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_prefix      TEXT NOT NULL UNIQUE,
  secret_hash     TEXT NOT NULL,
  status          api_key_status NOT NULL DEFAULT 'active',
  permissions     JSONB NOT NULL DEFAULT '["services:read","orders:create","orders:read","orders:cancel","balance:read"]'::jsonb,
  allowed_ips     TEXT[] NOT NULL DEFAULT '{}',
  last_used_at    TIMESTAMPTZ,
  last_used_ip    TEXT,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_developer ON api_keys (developer_id, status);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (secret_hash);

DO $$ BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_api_key_fk FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS api_webhooks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id        UUID NOT NULL REFERENCES api_developers(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url                 TEXT NOT NULL,
  description         TEXT,
  secret_encrypted    TEXT NOT NULL,
  secret_prefix       TEXT NOT NULL,
  events              JSONB NOT NULL DEFAULT '["order.created","order.processing","order.completed","order.partial","order.failed","order.refunded"]'::jsonb,
  is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_webhooks_developer ON api_webhooks (developer_id);

CREATE TABLE IF NOT EXISTS api_webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID NOT NULL REFERENCES api_webhooks(id) ON DELETE CASCADE,
  developer_id    UUID NOT NULL REFERENCES api_developers(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  http_status     INTEGER,
  response_body   TEXT,
  error_message   TEXT,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_retry
  ON api_webhook_deliveries (status, next_retry_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_webhook
  ON api_webhook_deliveries (webhook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      TEXT NOT NULL UNIQUE,
  developer_id    UUID REFERENCES api_developers(id) ON DELETE SET NULL,
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  method          TEXT NOT NULL,
  path            TEXT NOT NULL,
  status_code     INTEGER NOT NULL,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  ip_address      TEXT,
  user_agent      TEXT,
  error_code      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_developer ON api_request_logs (developer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created ON api_request_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_status ON api_request_logs (status_code);

INSERT INTO settings (key, value)
VALUES (
  'api',
  '{
    "enabled": true,
    "defaultRateLimit": 100,
    "resellerRateLimit": 500,
    "premiumRateLimit": 2000,
    "requireHttpsWebhooks": true,
    "maxKeysPerDeveloper": 10,
    "maxWebhooksPerDeveloper": 5
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE api_developers ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
