-- Hide provider junk titles (tildes, slashes, no real words) from the storefront.
UPDATE products
SET status = 'inactive', updated_at = NOW()
WHERE status = 'active'
  AND name !~* '[A-Za-z]{3,}';
