import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { hashPassword, makeSlug, signToken, uniqueSlug, verifyPassword } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import type { AuthUser } from "../middleware/auth.js";

const publicUser = `
  id, email, full_name, phone, role, status, avatar_url, last_login_at, created_at
`;

export async function registerUser(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  asReseller?: boolean;
  storeName?: string;
  ip?: string;
}) {
  const existing = await queryOne(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [input.email]);
  if (existing) throw new AppError("An account with this email already exists", 409);

  return withTransaction(async (client) => {
    const passwordHash = await hashPassword(input.password);
    const role = input.asReseller ? "reseller" : "customer";
    const user = await queryOne(
      `INSERT INTO users (email, password_hash, full_name, phone, role, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING ${publicUser}`,
      [input.email.toLowerCase(), passwordHash, input.fullName, input.phone ?? null, role],
      client
    );
    if (!user) throw new AppError("Unable to create account", 500);

    await query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`, [user.id], client);

    if (input.asReseller) {
      const storeName = input.storeName || `${input.fullName}'s Store`;
      await query(
        `INSERT INTO resellers (user_id, status, store_name, store_slug)
         VALUES ($1, 'pending', $2, $3)`,
        [user.id, storeName, uniqueSlug(storeName)],
        client
      );
    }

    await notify({
      userId: user.id,
      title: "Welcome to LinkWaveHub",
      body: "Your account is ready. Add funds to your wallet to start placing orders.",
      type: "account",
    });

    const token = signToken({ id: user.id, role: user.role, email: user.email });
    return { user, token };
  });
}

export async function loginUser(email: string, password: string, ip?: string, userAgent?: string) {
  const user = await queryOne<{
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    role: AuthUser["role"];
    status: AuthUser["status"];
    avatar_url: string | null;
    last_login_at: string | null;
    created_at: string;
    password_hash: string | null;
  }>(
    `SELECT ${publicUser}, password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  if (!user) throw new AppError("Invalid email or password", 401);
  if (!user.password_hash) {
    throw new AppError("This account uses Google sign-in. Continue with Google instead.", 401);
  }
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new AppError("Invalid email or password", 401);
  if (user.status === "suspended") throw new AppError("Account is suspended", 403);

  await query(`UPDATE users SET last_login_at = NOW(), last_login_ip = $2 WHERE id = $1`, [user.id, ip ?? null]);

  if (user.role === "admin") {
    await writeAudit({
      actor: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: user.status },
      action: "admin.login",
      ip,
      userAgent,
    });
  }

  const { password_hash: _, ...safe } = user;
  const token = signToken({ id: user.id, role: user.role, email: user.email });
  return { user: safe, token };
}

export async function getMe(userId: string) {
  const user = await queryOne(`SELECT ${publicUser} FROM users WHERE id = $1`, [userId]);
  if (!user) throw new AppError("User not found", 404);
  const wallet = await queryOne(`SELECT id, balance, currency FROM wallets WHERE user_id = $1`, [userId]);
  const reseller = await queryOne(
    `SELECT id, status, store_name, store_slug, logo_url, brand_color, tagline, markup_percent
     FROM resellers WHERE user_id = $1`,
    [userId]
  );
  return { user, wallet, reseller };
}

export async function updateProfile(userId: string, input: { fullName: string; phone?: string | null }) {
  const user = await queryOne(
    `UPDATE users SET full_name = $2, phone = $3 WHERE id = $1 RETURNING ${publicUser}`,
    [userId, input.fullName, input.phone ?? null]
  );
  return user;
}

export async function changePassword(userId: string, current: string, next: string) {
  const row = await queryOne<{ password_hash: string | null }>(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (!row) throw new AppError("User not found", 404);
  if (row.password_hash) {
    const valid = await verifyPassword(current, row.password_hash);
    if (!valid) throw new AppError("Current password is incorrect", 400);
  }
  const hash = await hashPassword(next);
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, hash]);
}

export { makeSlug };
