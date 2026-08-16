-- Manual catalog items (Netflix, verification numbers, accounts) are fulfilled by admin.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS contact_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE products
SET contact_admin = TRUE, updated_at = NOW()
WHERE contact_admin = FALSE
  AND (
    provider_id IS NULL
    OR name ~* 'netflix'
    OR name ~* 'verif'
    OR name ~* 'dating'
    OR name ~* 'international.{0,40}tiktok'
    OR name ~* 'tiktok.{0,40}(account|premium)'
    OR name ~* 'whatsapp.{0,24}(number|otp|verif|code)'
    OR EXISTS (
      SELECT 1 FROM platforms pl
      WHERE pl.id = products.platform_id
        AND (
          pl.slug IN ('subscriptions')
          OR pl.slug LIKE '%subcription%'
          OR pl.name ~* 'subscription|netflix|dating|verif'
        )
    )
    OR EXISTS (
      SELECT 1 FROM categories c
      WHERE c.id = products.category_id
        AND (
          c.slug = 'netflix'
          OR c.name ~* 'netflix|verif|dating|international'
        )
    )
  );
