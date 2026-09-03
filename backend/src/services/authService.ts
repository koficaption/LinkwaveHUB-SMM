import crypto from "node:crypto";
import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import { passwordResetEmail, sendMail, mailConfigured } from "../mailer.js";
import { ACCOUNT_REMOVED_MESSAGE, hashPassword, makeSlug, newDepositCode, normalizePersonName, signToken, uniqueSlug, verifyPassword } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { attachReferrer, newReferralCode } from "./affiliateService.js";
import { getPublicSettings } from "./settingsService.js";
import { attachPanelCustomer, getPanelForUser } from "./resellerService.js";
import type { AuthUser } from "../middleware/auth.js";

const publicUser = `
  id, email, full_name, phone, whatsapp_number, gender, role, status, avatar_url, last_login_at, created_at, deposit_code
`;

export async function registerUser(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  whatsappNumber?: string;
  gender?: "male" | "female";
  asReseller?: boolean;
  storeName?: string;
  referralCode?: string;
  storeSlug?: string;
  ip?: string;
}) {
  const existing = await queryOne<{ id: string; deleted_at: string | null }>(
    `SELECT id, deleted_at FROM users WHERE LOWER(email) = LOWER($1)`,
    [input.email]
  );
  if (existing?.deleted_at) throw new AppError(ACCOUNT_REMOVED_MESSAGE, 409);
  if (existing) throw new AppError("An account with this email already exists", 409);

  const result = await withTransaction(async (client) => {
    const passwordHash = await hashPassword(input.password);
    const role = input.asReseller ? "reseller" : "customer";
    const user = await queryOne(
      `INSERT INTO users (email, password_hash, full_name, phone, whatsapp_number, gender, role, status, referral_code, deposit_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
       RETURNING ${publicUser}`,
      [input.email.toLowerCase(), passwordHash, normalizePersonName(input.fullName), input.phone ?? null, input.whatsappNumber ?? null, input.gender ?? null, role, newReferralCode(), newDepositCode()],
      client
    );
    if (!user) throw new AppError("Unable to create account", 500);

    await query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`, [user.id], client);

    if (input.referralCode) {
      await attachReferrer(user.id, input.referralCode, client);
    }
    if (!input.asReseller && input.storeSlug) {
      const panel = await queryOne<{ id: string }>(
        `SELECT id FROM resellers WHERE store_slug = $1 AND status = 'active'`,
        [input.storeSlug],
        client
      );
      if (panel) {
        await query(
          `UPDATE users SET panel_reseller_id = $2 WHERE id = $1 AND role = 'customer'`,
          [user.id, panel.id],
          client
        );
      }
    }

    if (input.asReseller) {
      const storeName = input.storeName || `${input.fullName}'s Store`;
      await query(
        `INSERT INTO resellers (user_id, status, store_name, store_slug)
         VALUES ($1, 'pending', $2, $3)`,
        [user.id, storeName, uniqueSlug(storeName)],
        client
      );
    }

    const token = signToken({ id: user.id, role: user.role, email: user.email });
    return { user, token };
  });

  const panel = input.asReseller ? null : await attachPanelCustomer(result.user.id, input.storeSlug);
  await notify({
    userId: result.user.id,
    title: panel ? `Welcome to ${panel.store_name}` : "Welcome to LinkBoost Growth",
    body: panel
      ? `Your account is ready on ${panel.store_name}. Add funds to order this panel's services.`
      : "Your account is ready. Add funds to your wallet to start placing orders.",
    type: "account",
  });
  return result;
}

export async function loginUser(email: string, password: string, ip?: string, userAgent?: string, storeSlug?: string) {
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
    deleted_at: string | null;
  }>(
    `SELECT ${publicUser}, password_hash, deleted_at FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  if (!user || user.deleted_at) {
    if (user?.deleted_at) throw new AppError(ACCOUNT_REMOVED_MESSAGE, 403);
    throw new AppError("Invalid email or password", 401);
  }
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

  const { password_hash: _, deleted_at: _deleted, ...safe } = user;
  const token = signToken({ id: user.id, role: user.role, email: user.email });
  if (storeSlug) await attachPanelCustomer(user.id, storeSlug);
  return { user: safe, token };
}

export async function getMe(userId: string) {
  const row = await queryOne<Record<string, unknown> & { deleted_at?: string | null }>(`SELECT ${publicUser}, deleted_at FROM users WHERE id = $1`, [userId]);
  if (!row || row.deleted_at) throw new AppError("User not found", 404);
  const { deleted_at: _removed, ...user } = row;
  const walletRow = await queryOne<{ id: string; balance: string; currency: string }>(
    `SELECT id, balance, currency FROM wallets WHERE user_id = $1`,
    [userId]
  );
  const wallet = walletRow
    ? { ...walletRow, available_balance: Number(walletRow.balance) }
    : null;
  const reseller = await queryOne(
    `SELECT id, status, store_name, store_slug, logo_url, brand_color, tagline, markup_percent,
            support_email, contact_phone, whatsapp_number, profit_balance
     FROM resellers WHERE user_id = $1`,
    [userId]
  );
  const resellerApplication = await queryOne(
    `SELECT a.id, a.store_name, a.fee_amount, a.currency, a.status, a.created_at,
            p.reference AS payment_reference, p.status AS payment_status
     FROM reseller_applications a
     LEFT JOIN payments p ON p.id = a.payment_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC
     LIMIT 1`,
    [userId]
  );
  const panel = await getPanelForUser(userId);
  return { user, wallet, reseller, resellerApplication, panel };
}

export async function updateProfile(userId: string, input: {
  fullName: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  gender?: "male" | "female";
}) {
  const user = await queryOne(
    `UPDATE users SET full_name = $2, phone = $3, whatsapp_number = $4, gender = COALESCE($5, gender) WHERE id = $1 RETURNING ${publicUser}`,
    [userId, normalizePersonName(input.fullName), input.phone ?? null, input.whatsappNumber ?? null, input.gender ?? null]
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

const GENERIC_RESET_MESSAGE = "If an account exists for that email, we sent a reset link.";

export async function requestPasswordReset(input: { email: string; origin?: string; ip?: string }) {
  const email = input.email.trim().toLowerCase();
  const user = await queryOne<{ id: string; email: string; full_name: string; status: string; deleted_at: string | null }>(
    `SELECT id, email, full_name, status, deleted_at FROM users WHERE LOWER(email) = $1`,
    [email]
  );

  if (!user || user.status === "suspended" || user.deleted_at) {
    return { message: GENERIC_RESET_MESSAGE, emailSent: await mailConfigured() };
  }

  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [user.id]
  );

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour', $3)`,
    [user.id, tokenHash, input.ip ?? null]
  );

  const origin = (input.origin || config.frontendUrl).replace(/\/$/, "");
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  const settings = await getPublicSettings();
  const siteName = String(settings.siteName || "LinkBoost Growth SMM");
  const mail = passwordResetEmail({ name: user.full_name, resetUrl, siteName });

  let emailSent = false;
  try {
    const result = await sendMail({ to: user.email, ...mail });
    emailSent = result.sent;
    if (!result.sent) {
      console.info(`[password-reset] Email not sent. Reset link created for ${user.email}`);
    }
  } catch (error) {
    console.error("[password-reset] Failed to send email", error);
  }

  return {
    message: emailSent
      ? GENERIC_RESET_MESSAGE
      : "Email sending is not connected yet. Use the reset link below.",
    emailSent,
    resetUrl: emailSent ? undefined : resetUrl,
  };
}

export async function resetPasswordWithToken(token: string, password: string) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  if (!row) throw new AppError("This reset link is invalid or has expired. Request a new one.", 400);

  const hash = await hashPassword(password);
  await withTransaction(async (client) => {
    await query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [row.user_id, hash], client);
    await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id], client);
    await query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [row.user_id],
      client
    );
  });

  await notify({
    userId: row.user_id,
    title: "Password updated",
    body: "Your password was changed using a reset link. If this was not you, contact support immediately.",
    type: "account",
  });
}

export { makeSlug };
