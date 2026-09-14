-- Child-panel customers belong to the reseller whose storefront link they used.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS panel_reseller_id UUID REFERENCES resellers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_panel_reseller ON users (panel_reseller_id)
  WHERE panel_reseller_id IS NOT NULL;
