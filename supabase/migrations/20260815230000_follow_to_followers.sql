UPDATE products p
SET category_id = c.id, updated_at = NOW()
FROM categories c
WHERE c.slug = 'followers'
  AND p.name ~* '\yfollow\y'
  AND p.name !~* 'follower'
  AND EXISTS (SELECT 1 FROM categories cur WHERE cur.id = p.category_id AND cur.slug = 'other');
