-- Unique provider service IDs so panel packages can be upserted on import.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_provider_service
  ON products (provider_id, provider_service_id)
  WHERE provider_id IS NOT NULL AND provider_service_id IS NOT NULL;
