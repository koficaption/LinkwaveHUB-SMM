-- Auth abuse controls: persist used reCAPTCHA tokens, rate-limit by hashed
-- email/IP, and revoke outstanding password-reset links (those tokens were
-- previously returned in the API when SMTP was not connected).

CREATE TABLE IF NOT EXISTS recaptcha_token_uses (
  token_hash  TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recaptcha_token_uses_expires ON recaptcha_token_uses (expires_at);

CREATE TABLE IF NOT EXISTS auth_abuse_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  email_hash  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_abuse_email_time
  ON auth_abuse_events (action, email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_abuse_ip_time
  ON auth_abuse_events (action, ip, created_at DESC);

ALTER TABLE recaptcha_token_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_abuse_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.recaptcha_token_uses FROM anon;
    REVOKE ALL ON TABLE public.auth_abuse_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.recaptcha_token_uses FROM authenticated;
    REVOKE ALL ON TABLE public.auth_abuse_events FROM authenticated;
  END IF;
END $$;

-- Any unused reset link issued before this deploy is no longer valid.
UPDATE password_reset_tokens
SET used_at = NOW()
WHERE used_at IS NULL;
