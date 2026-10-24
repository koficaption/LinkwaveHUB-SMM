-- Paid customer → reseller / child panel upgrades (admin-set fee, MoMo confirmation)

DO $$ BEGIN
  CREATE TYPE reseller_application_status AS ENUM (
    'pending_payment', 'pending_review', 'approved', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS reseller_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_name      TEXT NOT NULL,
  store_slug      TEXT NOT NULL,
  fee_amount      NUMERIC(14, 4) NOT NULL CHECK (fee_amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'GHS',
  status          reseller_application_status NOT NULL DEFAULT 'pending_review',
  payment_id      UUID REFERENCES payments(id) ON DELETE SET NULL,
  method_code     TEXT,
  sender_name     TEXT,
  sender_number   TEXT,
  note            TEXT,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reseller_applications_user
  ON reseller_applications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_applications_status
  ON reseller_applications (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_applications_open
  ON reseller_applications (user_id)
  WHERE status IN ('pending_payment', 'pending_review');

INSERT INTO settings (key, value)
VALUES (
  'resellers',
  '{"upgradeEnabled":true,"upgradeFee":200,"upgradeNote":"Pay the reseller / child panel fee by Mobile Money. After you pay, an admin confirms the payment and switches your dashboard to reseller."}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
