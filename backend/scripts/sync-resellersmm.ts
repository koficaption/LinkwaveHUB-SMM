import { queryOne, pool } from "../src/db.js";
import { importProviderPackages } from "../src/services/catalogImportService.js";
import type { AuthUser } from "../src/middleware/auth.js";

async function main() {
  const provider = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM providers
     WHERE api_url ILIKE '%resellersmm.com%' OR name ILIKE 'resellersmm%' OR slug ILIKE 'resellersmm%'
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`
  );
  if (!provider) throw new Error("ResellerSMM provider not found");

  const admin = await queryOne<AuthUser>(
    `SELECT id, email, full_name, role, status FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1`
  );
  if (!admin) throw new Error("No admin user found for import audit");

  console.log(`Importing all ResellerSMM packages for ${provider.name} (${provider.id})`);
  const result = await importProviderPackages(provider.id, admin, "script");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
