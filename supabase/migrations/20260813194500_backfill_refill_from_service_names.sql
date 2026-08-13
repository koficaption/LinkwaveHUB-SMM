-- Backfill refill flags from catalog names such as "Refill : 15 Day".
-- Do not treat "No Refill" as supported.

UPDATE products
SET
  refill_supported = TRUE,
  refill_days = COALESCE(
    NULLIF((regexp_match(name, 'refill[[:space:][:punct:]]*([0-9]+)[[:space:]]*(day|days|d)([[:space:][:punct:]]|$)', 'i'))[1], '')::int,
    NULLIF((regexp_match(name, '([0-9]+)[[:space:]]*(day|days)[[:space:]]*refill', 'i'))[1], '')::int,
    refill_days
  ),
  refill_type = COALESCE(refill_type, 'catalog'),
  updated_at = NOW()
WHERE refill_supported = FALSE
  AND name ~* 'refill'
  AND name !~* 'no[[:space:]]*refill'
  AND name !~* 'non[[:space:][:punct:]]*refill'
  AND name !~* 'without[[:space:]]*refill';

UPDATE products
SET
  refill_days = 365,
  refill_type = 'lifetime',
  updated_at = NOW()
WHERE refill_supported = TRUE
  AND name ~* 'lifetime'
  AND name ~* 'refill'
  AND name !~* 'no[[:space:]]*refill';
