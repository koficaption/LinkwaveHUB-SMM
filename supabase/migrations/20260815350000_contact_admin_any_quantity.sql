-- Manual contact-admin services (Netflix, SMS verification) can be bought in any quantity from 1.

UPDATE products
SET min_quantity = 1,
    max_quantity = GREATEST(max_quantity, 1000000),
    updated_at = NOW()
WHERE contact_admin = TRUE
  AND (
    name ~* 'netflix'
    OR name ~* 'verification'
    OR name ~* 'sms'
    OR name ~* 'dating'
    OR name ~* 'international.{0,40}tiktok'
    OR name ~* 'tiktok.{0,40}(account|premium)'
    OR name ~* 'creating of international'
  );
