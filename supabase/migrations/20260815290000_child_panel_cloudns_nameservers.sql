-- Child panels are hosted on ClouDNS, not Cloudflare.
-- Customers who buy a domain at Spaceship (or any registrar) point that domain here.

UPDATE settings
SET value = jsonb_set(
  value,
  '{nameservers}',
  '["dns1.cloudns.net", "dns2.cloudns.net"]'::jsonb
)
WHERE key = 'childPanels';
