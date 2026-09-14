-- Reseller storefront help contacts (like admin customer service) and withdrawable profit.

ALTER TABLE resellers
  ADD COLUMN IF NOT EXISTS support_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS profit_balance NUMERIC(14, 4) NOT NULL DEFAULT 0;

ALTER TABLE resellers
  DROP CONSTRAINT IF EXISTS resellers_profit_balance_check;
ALTER TABLE resellers
  ADD CONSTRAINT resellers_profit_balance_check CHECK (profit_balance >= 0);

CREATE TABLE IF NOT EXISTS reseller_withdrawals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id   UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
  destination   TEXT NOT NULL CHECK (destination IN ('momo', 'wallet')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  momo_network  TEXT,
  momo_number   TEXT,
  momo_name     TEXT,
  note          TEXT,
  admin_note    TEXT,
  reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reseller_withdrawals_reseller
  ON reseller_withdrawals (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_withdrawals_status
  ON reseller_withdrawals (status, created_at DESC);

ALTER TABLE reseller_withdrawals ENABLE ROW LEVEL SECURITY;
