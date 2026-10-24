-- Refill configuration on products + refill request history
DO $$ BEGIN
  CREATE TYPE refill_status AS ENUM (
    'requested', 'processing', 'completed', 'failed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS refill_supported BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refill_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS refill_type TEXT,
  ADD COLUMN IF NOT EXISTS refill_service_id TEXT,
  ADD COLUMN IF NOT EXISTS refill_instructions TEXT,
  ADD COLUMN IF NOT EXISTS refill_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider_refill_supported BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reseller_available BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS api_available BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE products
SET refill_supported = TRUE,
    provider_refill_supported = TRUE
WHERE refill_supported = FALSE
  AND features::text ILIKE '%refill%';

CREATE TABLE IF NOT EXISTS refills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           TEXT NOT NULL UNIQUE,
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  provider_id         UUID REFERENCES providers(id) ON DELETE SET NULL,
  provider_refill_id  TEXT,
  status              refill_status NOT NULL DEFAULT 'requested',
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at       TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  attempts            INTEGER NOT NULL DEFAULT 1,
  error_message       TEXT,
  admin_note          TEXT,
  requested_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refills_order ON refills (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refills_status ON refills (status);
CREATE INDEX IF NOT EXISTS idx_refills_user ON refills (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_refill ON products (refill_supported, status);

CREATE INDEX IF NOT EXISTS idx_products_refill_filter ON products (provider_id) WHERE refill_supported = TRUE;
