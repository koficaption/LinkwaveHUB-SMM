-- Drop category links that no longer have an active service for that platform.
DELETE FROM platform_categories pc
WHERE NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.platform_id = pc.platform_id
    AND p.category_id = pc.category_id
    AND p.status = 'active'
);
