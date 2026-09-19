-- Only Netflix-style packages are priced per unit. "Subscription" in SMM titles is still per 1,000.
UPDATE products
SET price_unit = 'per_1000', updated_at = NOW()
WHERE price_unit = 'each'
  AND name !~* 'netflix';
