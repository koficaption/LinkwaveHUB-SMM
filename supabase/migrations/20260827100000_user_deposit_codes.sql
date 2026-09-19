-- Unique, stable payment reference for every customer and reseller.
-- Shown on Add Funds as the MoMo / bank note. Admin matches it, then confirms.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_code TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deposit_code TEXT;

DO $$
DECLARE
  rec RECORD;
  candidate TEXT;
  n INT;
BEGIN
  FOR rec IN SELECT id, email FROM users WHERE deposit_code IS NULL LOOP
    n := 0;
    LOOP
      candidate := 'LBG' || UPPER(SUBSTRING(MD5(rec.id::text || COALESCE(rec.email, '') || n::text) FROM 1 FOR 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE deposit_code = candidate);
      n := n + 1;
    END LOOP;
    UPDATE users SET deposit_code = candidate WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN deposit_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_deposit_code_key ON users (deposit_code);

UPDATE payments p
SET deposit_code = u.deposit_code
FROM users u
WHERE u.id = p.user_id AND p.deposit_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_deposit_code ON payments (deposit_code);

CREATE OR REPLACE FUNCTION assign_user_deposit_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
  n INT := 0;
BEGIN
  IF NEW.deposit_code IS NOT NULL AND BTRIM(NEW.deposit_code) <> '' THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := 'LBG' || UPPER(SUBSTRING(
      MD5(COALESCE(NEW.id::text, gen_random_uuid()::text) || COALESCE(NEW.email, '') || clock_timestamp()::text || n::text)
      FROM 1 FOR 6
    ));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE deposit_code = candidate);
    n := n + 1;
  END LOOP;
  NEW.deposit_code := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_assign_deposit_code ON users;
CREATE TRIGGER users_assign_deposit_code
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION assign_user_deposit_code();
