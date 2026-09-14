-- Show admin-created brand categories such as Netflix under Subscription.

UPDATE categories
SET is_active = TRUE, updated_at = NOW()
WHERE is_active = FALSE
  AND (
    slug = 'netflix'
    OR name ILIKE 'netflix'
    OR name ILIKE '%subscription%'
  );

INSERT INTO platform_categories (platform_id, category_id)
SELECT p.id, c.id
FROM platforms p
CROSS JOIN categories c
WHERE p.is_active = TRUE
  AND c.is_active = TRUE
  AND (
    p.slug = 'subscriptions'
    OR p.slug LIKE '%subscription%'
    OR p.slug LIKE '%subcription%'
    OR p.name ILIKE '%subscription%'
    OR p.name ILIKE '%subcription%'
    OR p.name ILIKE '%netflix%'
    OR p.slug LIKE 'netflix%'
  )
  AND (
    c.slug = 'netflix'
    OR c.name ILIKE 'netflix'
  )
ON CONFLICT DO NOTHING;
