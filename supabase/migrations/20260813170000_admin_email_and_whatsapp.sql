ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = 'owussamuel18@gmail.com') THEN
    UPDATE users
       SET role = 'admin',
           status = 'active',
           updated_at = NOW()
     WHERE LOWER(email) = 'owussamuel18@gmail.com';
  ELSIF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = 'admin@linkwavehub.com') THEN
    UPDATE users
       SET email = 'owussamuel18@gmail.com',
           updated_at = NOW()
     WHERE LOWER(email) = 'admin@linkwavehub.com';
  END IF;
END $$;
