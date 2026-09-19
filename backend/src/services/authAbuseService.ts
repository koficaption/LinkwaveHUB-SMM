import crypto from "node:crypto";
import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import { canonicalEmail, normalizeClientIp } from "./signupGuard.js";

const LOGIN_WINDOW_MIN = 15;
const LOGIN_FAILS_PER_EMAIL = 5;
const LOGIN_FAILS_PER_IP = 12;
const REGISTER_WINDOW_MIN = 60;
const REGISTER_ATTEMPTS_PER_EMAIL = 5;
const RESET_WINDOW_MIN = 60;
const RESET_ATTEMPTS_PER_EMAIL = 3;
const RESET_ATTEMPTS_PER_IP = 8;

const memoryCounts = new Map<string, { count: number; resetAt: number }>();

function emailHash(email: string) {
  const canonical = canonicalEmail(email);
  return crypto.createHmac("sha256", config.jwtSecret).update(canonical).digest("hex");
}

function memoryKey(action: string, part: string) {
  return `${action}:${part}`;
}

function bumpMemory(key: string, windowMs: number) {
  const now = Date.now();
  const row = memoryCounts.get(key);
  if (!row || row.resetAt <= now) {
    memoryCounts.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  row.count += 1;
  return row.count;
}

function memoryCount(key: string) {
  const row = memoryCounts.get(key);
  if (!row || row.resetAt <= Date.now()) return 0;
  return row.count;
}

async function countEvents(action: string, field: "email_hash" | "ip", value: string, minutes: number) {
  try {
    const row = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM auth_abuse_events
       WHERE action = $1 AND ${field} = $2 AND created_at > NOW() - ($3::text || ' minutes')::interval`,
      [action, value, String(minutes)]
    );
    return Number(row?.count ?? 0);
  } catch {
    return memoryCount(memoryKey(action, value));
  }
}

async function recordEvent(action: string, email?: string, ip?: string) {
  const hash = email ? emailHash(email) : null;
  const client = normalizeClientIp(ip);
  try {
    await query(
      `INSERT INTO auth_abuse_events (action, email_hash, ip) VALUES ($1, $2, $3)`,
      [action, hash, client || null]
    );
    await query(`DELETE FROM auth_abuse_events WHERE created_at < NOW() - INTERVAL '2 days'`);
  } catch {
    const windowMs = action.startsWith("login") ? LOGIN_WINDOW_MIN * 60_000 : REGISTER_WINDOW_MIN * 60_000;
    if (hash) bumpMemory(memoryKey(action, hash), windowMs);
    if (client) bumpMemory(memoryKey(action, client), windowMs);
  }
}

export async function assertLoginAllowed(email: string, ip?: string) {
  const hash = emailHash(email);
  const client = normalizeClientIp(ip);
  const emailFails = await countEvents("login_fail", "email_hash", hash, LOGIN_WINDOW_MIN);
  if (emailFails >= LOGIN_FAILS_PER_EMAIL) {
    throw new AppError("Too many failed sign-in attempts. Wait 15 minutes and try again.", 429);
  }
  if (client && client !== "unknown" && client !== "127.0.0.1") {
    const ipFails = await countEvents("login_fail", "ip", client, LOGIN_WINDOW_MIN);
    if (ipFails >= LOGIN_FAILS_PER_IP) {
      throw new AppError("Too many failed sign-in attempts. Wait 15 minutes and try again.", 429);
    }
  }
}

export async function recordFailedLogin(email: string, ip?: string) {
  await recordEvent("login_fail", email, ip);
}

export async function clearFailedLogins(email: string) {
  const hash = emailHash(email);
  try {
    await query(`DELETE FROM auth_abuse_events WHERE action = 'login_fail' AND email_hash = $1`, [hash]);
  } catch {
    memoryCounts.delete(memoryKey("login_fail", hash));
  }
}

export async function assertRegisterAllowed(email: string, ip?: string) {
  const hash = emailHash(email);
  const attempts = await countEvents("register_attempt", "email_hash", hash, REGISTER_WINDOW_MIN);
  if (attempts >= REGISTER_ATTEMPTS_PER_EMAIL) {
    throw new AppError("Too many account attempts for this email. Try again later.", 429);
  }
  void ip;
}

export async function recordRegisterAttempt(email: string, ip?: string) {
  await recordEvent("register_attempt", email, ip);
}

export async function assertPasswordResetAllowed(email: string, ip?: string) {
  const hash = emailHash(email);
  const client = normalizeClientIp(ip);
  const emailAttempts = await countEvents("reset_attempt", "email_hash", hash, RESET_WINDOW_MIN);
  if (emailAttempts >= RESET_ATTEMPTS_PER_EMAIL) {
    throw new AppError("Too many password reset requests. Try again later.", 429);
  }
  if (client && client !== "unknown" && client !== "127.0.0.1") {
    const ipAttempts = await countEvents("reset_attempt", "ip", client, RESET_WINDOW_MIN);
    if (ipAttempts >= RESET_ATTEMPTS_PER_IP) {
      throw new AppError("Too many password reset requests. Try again later.", 429);
    }
  }
}

export async function recordPasswordResetAttempt(email: string, ip?: string) {
  await recordEvent("reset_attempt", email, ip);
}

export async function consumeRecaptchaHash(tokenHash: string, ttlMs: number) {
  const expires = new Date(Date.now() + ttlMs);
  try {
    await query(`DELETE FROM recaptcha_token_uses WHERE expires_at <= NOW()`);
    await query(
      `INSERT INTO recaptcha_token_uses (token_hash, expires_at) VALUES ($1, $2)`,
      [tokenHash, expires.toISOString()]
    );
    return;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      throw new AppError("Google verification failed. Tick the box again and retry.", 400);
    }
  }
  return "memory" as const;
}
