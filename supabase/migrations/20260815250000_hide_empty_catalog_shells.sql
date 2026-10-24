-- Hide leftover fake Netflix platforms and empty category shells from the storefront.

UPDATE platforms
SET is_active = FALSE, updated_at = NOW()
WHERE is_active = TRUE
  AND (
    slug LIKE 'netflix%'
    OR slug LIKE 'threads-%'
    OR (
      NOT EXISTS (
        SELECT 1 FROM products p
        WHERE p.platform_id = platforms.id AND p.status = 'active'
      )
      AND slug NOT IN (
        'tiktok','instagram','youtube','facebook','x','telegram','spotify','threads',
        'snapchat','whatsapp','discord','linkedin','twitch','pinterest','apple-music',
        'audiomack','reddit','soundcloud','deezer','rumble','likee','kwai','kick',
        'subscriptions','website-traffic','other'
      )
    )
  );

UPDATE categories
SET is_active = FALSE, updated_at = NOW()
WHERE is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.category_id = categories.id AND p.status = 'active'
  );

DELETE FROM platform_categories pc
WHERE NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.platform_id = pc.platform_id
    AND p.category_id = pc.category_id
    AND p.status = 'active'
);
