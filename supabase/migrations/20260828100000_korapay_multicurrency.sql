-- Point the Korapay method at automatic multi-country checkout.
-- Wallet stays GHS; Korapay collects GHS, NGN, and other enabled currencies.

UPDATE payment_methods
SET
  name = 'Korapay (automatic)',
  description = 'Pay instantly with Mobile Money in Ghana, cards/bank in Nigeria, and other Korapay countries. Your wallet is credited in GHS after Korapay confirms.'
WHERE adapter IN ('korapay', 'paystack', 'card')
  AND (
    name IN ('Card / Korapay', 'Card / Paystack', 'Korapay')
    OR description ILIKE '%korapay checkout%'
  );
