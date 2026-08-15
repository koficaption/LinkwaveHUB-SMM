import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { writeAudit } from "./auditService.js";
import type { AuthUser } from "../middleware/auth.js";

export const RESET_CONFIRM_PHRASE = "RESET DASHBOARD";

const TRANSACTIONAL_TABLES = [
  "api_webhook_deliveries",
  "api_request_logs",
  "api_webhooks",
  "api_keys",
  "api_developers",
  "refills",
  "reseller_withdrawals",
  "affiliate_commissions",
  "reseller_applications",
  "reseller_products",
  "resellers",
  "support_messages",
  "support_tickets",
  "notifications",
  "order_status_history",
  "order_items",
  "orders",
  "payments",
  "wallet_transactions",
  "password_reset_tokens",
  "audit_logs",
  "wallets",
];

async function existingTables(client: Parameters<typeof query>[2], names: string[]) {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [names],
    client
  );
  const found = new Set(rows.map((row) => row.table_name));
  return names.filter((name) => found.has(name));
}

export async function resetDashboard(input: {
  confirm: string;
  actor: AuthUser;
  ip?: string;
  userAgent?: string;
}) {
  if (input.confirm.trim().toUpperCase() !== RESET_CONFIRM_PHRASE) {
    throw new AppError(`Type ${RESET_CONFIRM_PHRASE} to confirm`, 400);
  }
  if (input.actor.role !== "admin") {
    throw new AppError("Only an admin can reset the dashboard", 403);
  }

  const before = await queryOne<{
    customers: string;
    resellers: string;
    orders: string;
    payments: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role <> 'admin') AS customers,
      (SELECT COUNT(*) FROM users WHERE role = 'reseller') AS resellers,
      (SELECT COUNT(*) FROM orders) AS orders,
      (SELECT COUNT(*) FROM payments) AS payments
  `);

  const result = await withTransaction(async (client) => {
    const admins = await query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE role = 'admin'`,
      [],
      client
    );
    if (!admins.length) throw new AppError("Reset aborted: no admin account to keep", 500);
    if (!admins.some((admin) => admin.id === input.actor.id)) {
      throw new AppError("Reset aborted: your admin account was not found", 500);
    }

    const tables = await existingTables(client, TRANSACTIONAL_TABLES);
    if (tables.length) {
      await client.query(`TRUNCATE TABLE ${tables.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }

    const columns = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'referred_by_id'`,
      [],
      client
    );
    if (columns.length) {
      await client.query(`UPDATE users SET referred_by_id = NULL WHERE referred_by_id IS NOT NULL`);
    }
    const removed = await queryOne<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM users WHERE role <> 'admin' RETURNING id
       )
       SELECT COUNT(*)::text AS count FROM deleted`,
      [],
      client
    );

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       SELECT id, 0 FROM users WHERE role = 'admin'
       ON CONFLICT (user_id) DO UPDATE SET balance = 0, updated_at = NOW()`
    );

    return {
      keptAdmins: admins.map((admin) => admin.email),
      removedUsers: Number(removed?.count ?? 0),
    };
  });

  await writeAudit({
    actor: input.actor,
    action: "reset_dashboard",
    targetType: "platform",
    details: {
      removedUsers: result.removedUsers,
      keptAdmins: result.keptAdmins,
      before,
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return {
    removedUsers: result.removedUsers,
    keptAdmins: result.keptAdmins,
    before: {
      customers: Number(before?.customers ?? 0),
      resellers: Number(before?.resellers ?? 0),
      orders: Number(before?.orders ?? 0),
      payments: Number(before?.payments ?? 0),
    },
    kept: ["admin accounts", "product catalog", "platforms", "categories", "providers", "payment methods", "settings"],
  };
}
