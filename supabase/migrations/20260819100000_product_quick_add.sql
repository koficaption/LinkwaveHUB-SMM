-- Quick Add services: persist type, stock, delivery method, and a short public service number.
-- Existing catalog rows, orders, providers, and pricing are unchanged.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS stock INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_service_type_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_service_type_check
      CHECK (service_type IN ('api', 'manual', 'digital_product', 'subscription', 'account', 'other'));
  END IF;
END $$;

UPDATE products
SET service_type = CASE
  WHEN name ~* 'netflix' OR name ~* 'subscription' THEN 'subscription'
  WHEN name ~* '\baccount\b' AND (contact_admin = TRUE OR provider_id IS NULL) THEN 'account'
  WHEN contact_admin = TRUE OR provider_id IS NULL THEN 'manual'
  ELSE 'api'
END
WHERE service_type = 'api';

CREATE SEQUENCE IF NOT EXISTS products_service_no_seq START WITH 10001;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS service_no BIGINT;

UPDATE products
SET service_no = nextval('products_service_no_seq')
WHERE service_no IS NULL;

ALTER TABLE products
  ALTER COLUMN service_no SET DEFAULT nextval('products_service_no_seq');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'service_no' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE products ALTER COLUMN service_no SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_service_no_uidx ON products (service_no);
