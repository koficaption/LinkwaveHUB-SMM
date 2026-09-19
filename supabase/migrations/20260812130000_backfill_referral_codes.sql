-- Backfill referral codes for users created before the affiliate columns existed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_payment ON affiliate_commissions (payment_id) WHERE payment_id IS NOT NULL;

UPDATE users
SET referral_code = 'LWH' || UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;
