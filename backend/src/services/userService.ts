import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { hashPassword, like, parsePagination } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import type { AuthUser } from "../middleware/auth.js";

const publicUser = `id, email, full_name, phone, whatsapp_number, role, status, avatar_url, last_login_at, last_login_ip, created_at, updated_at`;

export async function listUsers(opts: { search?: string; role?: string; status?: string; page?: number; limit?: number }) {
  const p = parsePagination(opts as Record<string, unknown>);
  const params: unknown[] = [];
  const where: string[] = [];
  const search = like(opts.search);
  if (search) {
    params.push(search);
    where.push(`(email ILIKE $${params.length} OR full_name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  if (opts.role) {
    params.push(opts.role);
    where.push(`role = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(`SELECT COUNT(*) FROM users ${whereSql}`, params);
  params.push(p.limit, p.offset);
  const items = await query(
    `SELECT ${publicUser} FROM users ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function getUserDetail(id: string) {
  const user = await queryOne(`SELECT ${publicUser} FROM users WHERE id = $1`, [id]);
  if (!user) throw new AppError("User not found", 404);
  const wallet = await queryOne(`SELECT * FROM wallets WHERE user_id = $1`, [id]);
  const orders = await query(
    `SELECT o.public_id, o.status, o.charge, o.created_at, p.name AS product_name
     FROM orders o JOIN products p ON p.id = o.product_id
     WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 20`,
    [id]
  );
  const transactions = await query(
    `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [id]
  );
  const stats = await queryOne(
    `SELECT COUNT(*)::int AS order_count, COALESCE(SUM(charge),0) AS total_spent
     FROM orders WHERE user_id = $1 AND status NOT IN ('cancelled','refunded','failed')`,
    [id]
  );
  const reseller = await queryOne(`SELECT * FROM resellers WHERE user_id = $1`, [id]);
  return { user, wallet, orders, transactions, stats, reseller };
}

export async function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
}, actor: AuthUser, ip?: string) {
  const exists = await queryOne(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [input.email]);
  if (exists) throw new AppError("Email already in use", 409);
  const hash = await hashPassword(input.password);
  const user = await queryOne(
    `INSERT INTO users (email, password_hash, full_name, phone, role, status)
     VALUES ($1,$2,$3,$4,$5,'active') RETURNING ${publicUser}`,
    [input.email.toLowerCase(), hash, input.fullName, input.phone ?? null, input.role]
  );
  await query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`, [user!.id]);
  if (input.role === "reseller") {
    await query(
      `INSERT INTO resellers (user_id, status, store_name, store_slug)
       VALUES ($1, 'active', $2, $3)`,
      [user!.id, `${input.fullName} Store`, `store-${user!.id.slice(0, 8)}`]
    );
  }
  await writeAudit({ actor, action: "user.create", targetType: "user", targetId: user!.id, ip });
  return user;
}

export async function updateUser(id: string, input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const user = await queryOne(
    `UPDATE users SET
      full_name = COALESCE($2, full_name),
      phone = COALESCE($3, phone),
      role = COALESCE($4, role),
      status = COALESCE($5, status)
     WHERE id = $1 RETURNING ${publicUser}`,
    [id, input.fullName ?? null, input.phone ?? null, input.role ?? null, input.status ?? null]
  );
  if (!user) throw new AppError("User not found", 404);
  if (input.status === "suspended") {
    await notify({ userId: id, title: "Account suspended", body: "Your LinkBoost Growth account has been suspended.", type: "account" });
    await writeAudit({ actor, action: "user.suspend", targetType: "user", targetId: id, ip });
  } else if (input.status === "active") {
    await writeAudit({ actor, action: "user.activate", targetType: "user", targetId: id, ip });
  } else {
    await writeAudit({ actor, action: "user.update", targetType: "user", targetId: id, ip, details: input });
  }
  return user;
}

export async function deleteUser(id: string, actor: AuthUser, ip?: string) {
  if (id === actor.id) throw new AppError("You cannot delete your own account");
  const orders = await queryOne(`SELECT id FROM orders WHERE user_id = $1 LIMIT 1`, [id]);
  if (orders) {
    await query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [id]);
    await writeAudit({ actor, action: "user.suspend", targetType: "user", targetId: id, ip, details: { reason: "delete_blocked_has_orders" } });
    return { suspended: true };
  }
  await query(`DELETE FROM users WHERE id = $1`, [id]);
  await writeAudit({ actor, action: "user.delete", targetType: "user", targetId: id, ip });
  return { deleted: true };
}

export async function resetPassword(id: string, password: string, actor: AuthUser, ip?: string) {
  const hash = await hashPassword(password);
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, hash]);
  await writeAudit({ actor, action: "user.reset_password", targetType: "user", targetId: id, ip });
  await notify({ userId: id, title: "Password reset", body: "An administrator reset your password. Please sign in and change it.", type: "account" });
}
