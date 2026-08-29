-- Customer cancel: persist the provider/service cancel flag and track wallet refunds.
-- Existing orders, wallets, and catalog rows stay in place.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cancel_supported BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE products
SET cancel_supported = TRUE
WHERE cancel_supported IS NOT TRUE
  AND (
    features::text ~* 'cancel[[:space:]]*(anytime|any[[:space:]]*time|available|supported|button)'
    OR name ~* 'cancel[[:space:]]*(anytime|any[[:space:]]*time)'
    OR COALESCE(description, '') ~* 'cancel[[:space:]]*(anytime|any[[:space:]]*time)'
  )
  AND features::text !~* 'no[[:space:]]*cancel'
  AND name !~* 'no[[:space:]]*cancel'
  AND COALESCE(description, '') !~* 'no[[:space:]]*cancel';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(14,4) NOT NULL DEFAULT 0;

UPDATE orders
SET refunded_amount = charge
WHERE status IN ('refunded')
  AND refunded_amount = 0
  AND charge > 0;
