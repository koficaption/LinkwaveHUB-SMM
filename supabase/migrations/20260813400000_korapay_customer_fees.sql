-- Add Korapay processing fee and VAT onto the amount the customer pays at checkout.
-- Wallet credit stays the amount they entered; Korapay tax is an extra line.

INSERT INTO settings (key, value)
VALUES (
  'payments',
  '{"autoApproveMock":true,"korapayCustomerPaysFees":true,"korapayFeePercent":1.5,"korapayVatPercent":15}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = COALESCE(settings.value, '{}'::jsonb)
  || '{"korapayCustomerPaysFees":true}'::jsonb
  || CASE
       WHEN settings.value ? 'korapayFeePercent' THEN '{}'::jsonb
       ELSE '{"korapayFeePercent":1.5}'::jsonb
     END
  || CASE
       WHEN settings.value ? 'korapayVatPercent' THEN '{}'::jsonb
       ELSE '{"korapayVatPercent":15}'::jsonb
     END,
    updated_at = NOW();
