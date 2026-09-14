-- Branded child-panel nameservers on the live domain.

UPDATE settings
SET value = jsonb_set(
  value,
  '{nameservers}',
  '["ns1.linkboostgrowth.site", "ns2.linkboostgrowth.site"]'::jsonb
)
WHERE key = 'childPanels';
