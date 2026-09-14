-- Keep only the live ResellerSMM provider.
-- Deactivate catalog rows that belonged to placeholder / backup providers, then delete those providers.
-- ResellerSMM products stay as-is; a later import syncs the full panel list.

DO $$
DECLARE
  keep_id uuid;
BEGIN
  SELECT id INTO keep_id
  FROM providers
  WHERE api_url ILIKE '%resellersmm.com%'
     OR name ILIKE 'resellersmm%'
     OR slug ILIKE 'resellersmm%'
  ORDER BY
    CASE WHEN status = 'active' THEN 0 ELSE 1 END,
    CASE WHEN adapter = 'generic_http' THEN 0 ELSE 1 END,
    CASE WHEN api_key_encrypted IS NOT NULL AND length(api_key_encrypted) > 0 THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;

  IF keep_id IS NULL THEN
    RAISE NOTICE 'No ResellerSMM provider found; leaving providers unchanged';
    RETURN;
  END IF;

  UPDATE products
  SET status = 'inactive', updated_at = NOW()
  WHERE status = 'active'
    AND provider_id IS DISTINCT FROM keep_id;

  UPDATE providers
  SET status = 'active',
      adapter = 'generic_http',
      name = 'ResellersMM',
      updated_at = NOW()
  WHERE id = keep_id
    AND (status IS DISTINCT FROM 'active' OR adapter IS DISTINCT FROM 'generic_http' OR name IS DISTINCT FROM 'ResellersMM');

  DELETE FROM providers WHERE id <> keep_id;
END $$;
