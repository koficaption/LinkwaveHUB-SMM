-- Restore follower/like/view services that were widened by the previous
-- contact-admin quantity update. Keep any-quantity only on true manual items.

UPDATE products
SET min_quantity = 100,
    max_quantity = 100000,
    updated_at = NOW()
WHERE min_quantity = 1
  AND max_quantity = 1000000
  AND NOT (
    name ~* 'netflix'
    OR name ~* 'verification'
    OR name ~* 'sms'
    OR name ~* 'dating'
    OR name ~* 'international.{0,40}tiktok'
    OR name ~* 'tiktok.{0,40}(account|premium)'
    OR name ~* 'creating of international'
  );

UPDATE products
SET contact_admin = FALSE, updated_at = NOW()
WHERE contact_admin = TRUE
  AND provider_id IS NOT NULL
  AND NOT (
    name ~* 'netflix'
    OR name ~* 'verification'
    OR name ~* 'sms'
    OR name ~* 'dating'
    OR name ~* 'international.{0,40}tiktok'
    OR name ~* 'tiktok.{0,40}(account|premium)'
    OR name ~* 'creating of international'
  );

UPDATE products
SET min_quantity = 1,
    max_quantity = GREATEST(max_quantity, 1000000),
    contact_admin = TRUE,
    updated_at = NOW()
WHERE name ~* 'netflix'
   OR name ~* 'verification'
   OR name ~* 'sms'
   OR name ~* 'dating'
   OR name ~* 'international.{0,40}tiktok'
   OR name ~* 'tiktok.{0,40}(account|premium)'
   OR name ~* 'creating of international';
