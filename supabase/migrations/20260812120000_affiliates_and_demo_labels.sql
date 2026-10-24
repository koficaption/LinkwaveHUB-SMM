-- Affiliate / referral program + clearly labeled demo accounts
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'affiliate_commission';

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by_id);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id      UUID REFERENCES payments(id) ON DELETE SET NULL,
  deposit_amount  NUMERIC(14, 4) NOT NULL,
  rate_percent    NUMERIC(8, 2) NOT NULL,
  commission      NUMERIC(14, 4) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrer ON affiliate_commissions (referrer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_payment ON affiliate_commissions (payment_id) WHERE payment_id IS NOT NULL;

UPDATE users
SET referral_code = 'LWH' || UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Existing sample rows were fictional preview data, not another business's live database.
UPDATE users SET full_name = 'Demo Admin' WHERE email = 'admin@linkwavehub.com';
UPDATE users SET full_name = 'Demo Reseller' WHERE email = 'reseller@linkwavehub.com';
UPDATE users SET full_name = 'Demo Customer' WHERE email = 'customer@linkwavehub.com';
UPDATE users SET full_name = 'Demo User 1' WHERE email = 'yaw.owusu@linkwavehub.com';
UPDATE users SET full_name = 'Demo User 2' WHERE email = 'efua.asante@linkwavehub.com';
UPDATE users SET full_name = 'Demo User 3' WHERE email = 'kofi.mensah@linkwavehub.com';
UPDATE users SET full_name = 'Demo User 4' WHERE email = 'abena.serwaa@linkwavehub.com';

UPDATE resellers SET store_name = 'Demo Storefront', store_slug = 'demo-store', tagline = 'Sample reseller storefront for preview only'
  WHERE store_slug IN ('boostlab-gh', 'demo-store');
UPDATE resellers SET store_name = 'Demo Storefront 2', tagline = 'Sample pending reseller'
  WHERE store_slug = 'serwaa-social';

UPDATE providers SET name = 'Sample provider (not live)', notes = 'Placeholder only. Live SMM API (resellersmm.com / v2) will be connected later.'
  WHERE slug = 'linkwave-panel';

INSERT INTO settings (key, value)
VALUES ('affiliates', '{"enabled":true,"commissionPercent":7,"minimumPayout":10,"lifetime":true}')
ON CONFLICT (key) DO NOTHING;
