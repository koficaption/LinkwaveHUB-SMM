-- Paid orders should be sent to the integrated SMM panel automatically.
-- Existing installs stored autoProcessing=false and never called the provider on purchase.

INSERT INTO settings (key, value)
VALUES (
  'orders',
  '{"autoProcessing":true,"maxPendingPerUser":20,"refundWindowHours":48}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(
  COALESCE(settings.value, '{}'::jsonb),
  '{autoProcessing}',
  'true'::jsonb,
  true
),
updated_at = NOW();
