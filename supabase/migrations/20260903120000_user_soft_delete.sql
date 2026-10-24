-- Keep removed accounts off the Users list without freeing their email.
-- Hard delete let the same person sign up or Continue with Google again.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_not_deleted ON users (created_at DESC)
  WHERE deleted_at IS NULL;

-- "Jeff Desmond Jeff Desmond" → "Jeff Desmond"
UPDATE users
SET full_name = TRIM(regexp_replace(regexp_replace(full_name, '\s+', ' ', 'g'), '^(.+) \1$', '\1', 'i'))
WHERE regexp_replace(full_name, '\s+', ' ', 'g') ~* '^(.+) \1$';
