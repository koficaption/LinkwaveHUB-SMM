import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { encryptSecret, uniqueSlug } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { adapterForLiveProvider } from "../providers/smm/index.js";
import { decryptSecret } from "../utils.js";
import type { AuthUser } from "../middleware/auth.js";

function publicProvider(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    api_url: row.api_url,
    has_api_key: Boolean(row.api_key_encrypted),
    adapter: row.adapter,
    status: row.status,
    balance: row.balance,
    currency: row.currency,
    notes: row.notes,
    product_count: Number(row.product_count ?? 0),
    active_product_count: Number(row.active_product_count ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listProviders() {
  const rows = await query(`
    SELECT p.*,
      (SELECT COUNT(*) FROM products pr WHERE pr.provider_id = p.id) AS product_count,
      (SELECT COUNT(*) FROM products pr WHERE pr.provider_id = p.id AND pr.status = 'active') AS active_product_count
    FROM providers p
    ORDER BY name
  `);
  return rows.map(publicProvider);
}

export async function createProvider(input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const encrypted = input.apiKey ? encryptSecret(String(input.apiKey)) : null;
  const row = await queryOne(
    `INSERT INTO providers (name, slug, api_url, api_key_encrypted, adapter, status, currency, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      input.name,
      uniqueSlug(String(input.name)),
      input.apiUrl ?? null,
      encrypted,
      input.adapter ?? "generic_http",
      input.status ?? (input.isActive === false ? "inactive" : "active"),
      input.currency ?? "GHS",
      input.notes ?? null,
    ]
  );
  await writeAudit({ actor, action: "provider.create", targetType: "provider", targetId: row?.id, ip });
  return publicProvider(row!);
}

export async function updateProvider(id: string, input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const current = await queryOne(`SELECT * FROM providers WHERE id = $1`, [id]);
  if (!current) throw new AppError("Provider not found", 404);
  const encrypted = input.apiKey ? encryptSecret(String(input.apiKey)) : current.api_key_encrypted;
  const row = await queryOne(
    `UPDATE providers SET
      name = COALESCE($2, name),
      api_url = COALESCE($3, api_url),
      api_key_encrypted = $4,
      adapter = COALESCE($5, adapter),
      status = COALESCE($6, status),
      currency = COALESCE($7, currency),
      notes = COALESCE($8, notes)
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.name ?? null,
      input.apiUrl ?? null,
      encrypted,
      input.adapter ?? null,
      input.status ?? (input.isActive === false ? "inactive" : input.isActive === true ? "active" : null),
      input.currency ?? null,
      input.notes ?? null,
    ]
  );
  await writeAudit({ actor, action: "provider.update", targetType: "provider", targetId: id, ip });
  return publicProvider(row!);
}

export async function deleteProvider(id: string, actor: AuthUser, ip?: string) {
  const current = await queryOne(`SELECT id, name FROM providers WHERE id = $1`, [id]);
  if (!current) throw new AppError("Provider not found", 404);
  const remaining = await queryOne<{ count: string }>(`SELECT COUNT(*) FROM providers`);
  if (Number(remaining?.count ?? 0) <= 1) {
    throw new AppError("Keep the live ResellerSMM provider. Add another provider before deleting this one.", 400);
  }
  await query(
    `UPDATE products SET status = 'inactive', updated_at = NOW() WHERE provider_id = $1 AND status = 'active'`,
    [id]
  );
  await query(`UPDATE products SET provider_id = NULL WHERE provider_id = $1`, [id]);
  await query(`DELETE FROM providers WHERE id = $1`, [id]);
  await writeAudit({ actor, action: "provider.delete", targetType: "provider", targetId: id, details: { name: current.name }, ip });
}

export async function refreshProviderBalance(id: string) {
  try {
    const creds = await providerCredentials(id);
    const balance = await creds.adapter.getBalance(creds);
    await query(`UPDATE providers SET balance = $2 WHERE id = $1`, [id, balance]);
    return { ...publicProvider(creds.row), balance };
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : "Could not read provider balance", 502);
  }
}

export async function listProviderServices(id: string) {
  try {
    const creds = await providerCredentials(id);
    const services = await creds.adapter.listServices(creds);
    return { provider: publicProvider(creds.row), services };
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : "Could not load provider services", 502);
  }
}

async function providerCredentials(id: string) {
  const row = await queryOne<Record<string, unknown>>(`SELECT * FROM providers WHERE id = $1`, [id]);
  if (!row) throw new AppError("Provider not found", 404);
  const apiKey = row.api_key_encrypted ? decryptSecret(String(row.api_key_encrypted)) : undefined;
  const adapter = adapterForLiveProvider(row.adapter, Boolean(row.api_url && apiKey));
  return {
    row,
    adapter,
    apiUrl: row.api_url as string | undefined,
    apiKey,
  };
}
