-- Hosted Child Panel orders (own domain + nameservers). Separate from reseller storefront upgrades.

CREATE TABLE IF NOT EXISTS child_panel_orders (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id                  TEXT NOT NULL UNIQUE,
  user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain                     TEXT NOT NULL,
  panel_currency             TEXT NOT NULL DEFAULT 'USD',
  admin_username             TEXT NOT NULL,
  admin_password_encrypted   TEXT NOT NULL,
  monthly_price              NUMERIC(14, 4) NOT NULL CHECK (monthly_price >= 0),
  currency                   TEXT NOT NULL DEFAULT 'GHS',
  status                     TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'processing', 'active', 'rejected', 'cancelled', 'expired')),
  vip_complimentary          BOOLEAN NOT NULL DEFAULT FALSE,
  admin_note                 TEXT,
  expires_at                 TIMESTAMPTZ,
  provisioned_at             TIMESTAMPTZ,
  refunded_at                TIMESTAMPTZ,
  reviewed_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_child_panel_orders_user
  ON child_panel_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_child_panel_orders_status
  ON child_panel_orders (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_child_panel_orders_open_domain
  ON child_panel_orders (lower(domain))
  WHERE status IN ('pending', 'processing', 'active');

ALTER TABLE child_panel_orders ENABLE ROW LEVEL SECURITY;

INSERT INTO settings (key, value)
VALUES (
  'childPanels',
  '{
    "enabled": true,
    "monthlyPrice": 220,
    "nameservers": ["ns1.linkboostgrowth.site", "ns2.linkboostgrowth.site"],
    "currencies": [
      {"code":"USD","name":"U.S. Dollar (USD)"},
      {"code":"EUR","name":"Euro (EUR)"},
      {"code":"GBP","name":"Pound Sterling (GBP)"},
      {"code":"GHS","name":"Ghana Cedi (GHS)"},
      {"code":"NGN","name":"Nigerian Naira (NGN)"},
      {"code":"INR","name":"Indian Rupee (INR)"}
    ]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

UPDATE settings
SET value = jsonb_set(
  value,
  '{upgradeNote}',
  '"Pay the reseller upgrade fee by Mobile Money. After an admin confirms payment, your dashboard switches to reseller."'::jsonb
)
WHERE key = 'resellers'
  AND COALESCE(value->>'upgradeNote', '') ILIKE '%child panel%';
