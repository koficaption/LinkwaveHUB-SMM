-- Separate Likes + Views combo packages from standalone Likes / Views,
-- and remember when a provider service accepts custom comments.

INSERT INTO categories (name, slug, description, icon, sort_order, is_active)
VALUES ('Likes + Views', 'likes-views', 'Combined like and view packages', 'Heart', 25, TRUE)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = 25,
    is_active = TRUE,
    updated_at = NOW();

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS custom_comments BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS comments TEXT;

UPDATE products
SET custom_comments = TRUE, updated_at = NOW()
WHERE custom_comments = FALSE
  AND (
    name ~* 'custom[[:space:]]*comments?'
    OR features::text ~* 'custom[[:space:]]*comments?'
  );

UPDATE products p
SET category_id = c.id, updated_at = NOW()
FROM categories c
WHERE c.slug = 'likes-views'
  AND (
    p.name ~* 'likes?[[:space:]]*(\+|\/|&|and|,)[[:space:]]*views?'
    OR p.name ~* 'views?[[:space:]]*(\+|\/|&|and|,)[[:space:]]*likes?'
    OR p.name ~* '\ylikes?[[:space:]]+views?\y'
    OR p.name ~* '\yviews?[[:space:]]+likes?\y'
  );

INSERT INTO platform_categories (platform_id, category_id)
SELECT DISTINCT p.platform_id, p.category_id
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE c.slug = 'likes-views'
ON CONFLICT DO NOTHING;

UPDATE categories
SET is_active = EXISTS (
  SELECT 1 FROM products p
  WHERE p.category_id = categories.id AND p.status = 'active'
),
updated_at = NOW()
WHERE slug = 'likes-views';
