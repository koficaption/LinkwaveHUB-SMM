-- Dashboard welcome avatar: male vs female 3D portrait.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender TEXT;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_gender_check;

ALTER TABLE users
  ADD CONSTRAINT users_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));
