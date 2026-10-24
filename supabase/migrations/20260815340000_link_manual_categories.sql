-- Keep Netflix and verification numbers on the platforms that actually sell them.
-- Netflix Premium was showing under International SMS Verification Numbers because
-- it had no platform_categories row, so the storefront treated it as "all platforms".

INSERT INTO platform_categories (platform_id, category_id)
SELECT DISTINCT p.platform_id, p.category_id
FROM products p
WHERE p.status = 'active'
  AND p.platform_id IS NOT NULL
  AND p.category_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO platform_categories (platform_id, category_id)
SELECT p.id, c.id
FROM platforms p
CROSS JOIN categories c
WHERE p.is_active = TRUE
  AND c.is_active = TRUE
  AND (c.name ILIKE '%netflix%' OR c.slug ILIKE '%netflix%')
  AND (
    p.slug = 'subscriptions'
    OR p.slug ILIKE '%subscription%'
    OR p.slug ILIKE '%subcription%'
    OR p.name ILIKE '%subscription%'
    OR p.name ILIKE '%subcription%'
    OR p.name ILIKE '%netflix%'
  )
ON CONFLICT DO NOTHING;

DELETE FROM platform_categories pc
WHERE NOT EXISTS (
  SELECT 1 FROM products x
  WHERE x.platform_id = pc.platform_id
    AND x.category_id = pc.category_id
    AND x.status = 'active'
)
AND NOT EXISTS (
  SELECT 1
  FROM platforms p
  JOIN categories c ON c.id = pc.category_id
  WHERE p.id = pc.platform_id
    AND (c.name ILIKE '%netflix%' OR c.slug ILIKE '%netflix%')
    AND (
      p.slug = 'subscriptions'
      OR p.name ILIKE '%subscri%'
      OR p.name ILIKE '%subcription%'
      OR p.name ILIKE '%netflix%'
    )
);

UPDATE products
SET contact_admin = TRUE, updated_at = NOW()
WHERE contact_admin = FALSE
  AND (
    name ~* 'netflix'
    OR name ~* 'verif'
    OR name ~* 'dating'
    OR name ~* 'international.{0,40}(sms|tiktok)'
    OR name ~* 'sms.{0,24}(verif|number|otp|code)'
    OR name ~* 'tiktok.{0,40}(account|premium)'
    OR EXISTS (
      SELECT 1 FROM categories c
      WHERE c.id = products.category_id
        AND (
          c.slug ILIKE '%netflix%'
          OR c.name ~* 'netflix|verif|sms|dating|international'
        )
    )
    OR EXISTS (
      SELECT 1 FROM platforms pl
      WHERE pl.id = products.platform_id
        AND (
          pl.slug = 'subscriptions'
          OR pl.name ~* 'netflix|verif|sms|dating|subcription|subscription'
        )
    )
  );
