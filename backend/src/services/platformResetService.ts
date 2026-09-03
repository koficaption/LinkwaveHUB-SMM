import { query, queryOne } from "../db.js";

export const PRIMARY_ADMIN_EMAIL = "owussamuel18@gmail.com";

export async function ensurePrimaryAdmin() {
  const admin = await queryOne<{ id: string }>(`SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`);
  if (admin) return;
  const restored = await queryOne<{ email: string }>(
    `UPDATE users
     SET role = 'admin', status = 'active', email_verified = TRUE, updated_at = NOW()
     WHERE LOWER(email) = $1
     RETURNING email`,
    [PRIMARY_ADMIN_EMAIL]
  );
  if (restored) {
    console.log(`Restored admin role for ${restored.email}`);
    await query(
      `INSERT INTO wallets (user_id, balance)
       SELECT id, 0 FROM users WHERE LOWER(email) = $1
       ON CONFLICT (user_id) DO NOTHING`,
      [PRIMARY_ADMIN_EMAIL]
    );
  }
}
