import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { AppError } from "../errors.js";
import { query, queryOne } from "../db.js";
import { clientIp, sha256Hex, timingSafeEqualHex } from "../utils.js";
import type { AuthUser } from "./auth.js";

const rateWindows = new Map<string, { count: number; resetAt: number }>();
const authFailures = new Map<string, { count: number; resetAt: number }>();

function consumeWindow(map: Map<string, { count: number; resetAt: number }>, key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    map.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt, limit };
  }
  if (current.count >= limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt, limit };
  }
  current.count += 1;
  return { ok: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt, limit };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateWindows) if (value.resetAt <= now) rateWindows.delete(key);
  for (const [key, value] of authFailures) if (value.resetAt <= now) authFailures.delete(key);
}, 60_000).unref?.();

export function readApiKeyHeader(req: Request): string | null {
  const apiKeyHeader = req.headers["api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) return apiKeyHeader.trim();
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

export function looksLikeApiKey(value: string) {
  return /^lbk_(live|test)_[a-f0-9]{16,}$/i.test(value);
}

function ipAllowed(allowed: string[] | null | undefined, ip: string) {
  const list = (allowed ?? []).map((item) => item.trim()).filter(Boolean);
  if (!list.length) return true;
  return list.includes(ip) || list.includes("*");
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  const requestId = `req_${crypto.randomBytes(8).toString("hex")}`;
  req.apiRequestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const ip = clientIp(req);
  const abuse = authFailures.get(`ip:${ip}`);
  if (abuse && abuse.resetAt > Date.now() && abuse.count >= 40) {
    res.setHeader("Retry-After", String(Math.ceil((abuse.resetAt - Date.now()) / 1000)));
    return next(new AppError("Too many requests", 429, "rate_limited"));
  }

  try {
    const presented = readApiKeyHeader(req);
    if (!presented) throw new AppError("API key required. Send Authorization: Bearer YOUR_API_KEY or API-Key: YOUR_API_KEY", 401, "unauthorized");
    if (!looksLikeApiKey(presented)) {
      throw new AppError("Invalid API key", 401, "unauthorized");
    }

    const prefix = presented.slice(0, 17);
    const row = await queryOne<Record<string, unknown>>(
      `SELECT k.id, k.developer_id, k.user_id, k.name, k.key_prefix, k.secret_hash, k.status, k.permissions, k.allowed_ips AS key_ips,
              d.status AS developer_status, d.plan, d.rate_limit_per_minute, d.allowed_ips AS developer_ips,
              u.id AS account_id, u.email, u.full_name, u.role, u.status AS user_status, u.deleted_at
       FROM api_keys k
       JOIN api_developers d ON d.id = k.developer_id
       JOIN users u ON u.id = k.user_id
       WHERE k.key_prefix = $1`,
      [prefix]
    );
    if (!row) throw new AppError("Invalid API key", 401, "unauthorized");
    if (!timingSafeEqualHex(String(row.secret_hash), sha256Hex(presented))) {
      throw new AppError("Invalid API key", 401, "unauthorized");
    }
    if (row.status !== "active") throw new AppError("API key is not active", 403, "key_inactive");
    if (row.developer_status !== "approved") throw new AppError("API access is not approved", 403, "developer_inactive");
    if (row.deleted_at) throw new AppError("Account is not active", 403, "account_inactive");
    if (row.user_status === "suspended") throw new AppError("Account is suspended", 403, "account_suspended");
    if (row.user_status !== "active") throw new AppError("Account is not active", 403, "account_inactive");

    const keyIps = Array.isArray(row.key_ips) ? row.key_ips.map(String) : [];
    const developerIps = Array.isArray(row.developer_ips) ? row.developer_ips.map(String) : [];
    if (!ipAllowed(keyIps.length ? keyIps : developerIps, ip)) {
      throw new AppError("This IP address is not allowed to use this API key", 403, "ip_restricted");
    }

    const limit = Math.max(1, Number(row.rate_limit_per_minute) || 100);
    const rate = consumeWindow(rateWindows, `dev:${row.developer_id}`, limit);
    res.setHeader("X-RateLimit-Limit", String(rate.limit));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.ok) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))));
      throw new AppError("Too many requests", 429, "rate_limited");
    }

    const permissions = Array.isArray(row.permissions) ? row.permissions.map(String) : [];
    req.apiKey = {
      id: String(row.id),
      developer_id: String(row.developer_id),
      name: String(row.name),
      key_prefix: String(row.key_prefix),
      status: "active",
      permissions,
      allowed_ips: keyIps,
    };
    req.apiDeveloper = {
      id: String(row.developer_id),
      user_id: String(row.user_id),
      status: "approved",
      plan: row.plan as "free" | "reseller" | "premium",
      rate_limit_per_minute: limit,
      allowed_ips: developerIps,
    };
    req.user = {
      id: String(row.account_id),
      email: String(row.email),
      full_name: String(row.full_name),
      role: row.role as AuthUser["role"],
      status: row.user_status as AuthUser["status"],
    };

    query(`UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $2, updated_at = NOW() WHERE id = $1`, [
      row.id,
      ip,
    ]).catch(() => undefined);

    res.on("finish", () => {
      query(
        `INSERT INTO api_request_logs (
          request_id, developer_id, api_key_id, user_id, method, path, status_code, duration_ms, ip_address, user_agent, error_code
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          requestId,
          row.developer_id,
          row.id,
          row.user_id,
          req.method,
          (req.originalUrl || req.url).split("?")[0].slice(0, 300),
          res.statusCode,
          Date.now() - started,
          ip,
          String(req.headers["user-agent"] || "").slice(0, 300),
          res.statusCode >= 400 ? String(res.statusCode) : null,
        ]
      ).catch(() => undefined);
    });

    next();
  } catch (error) {
    consumeWindow(authFailures, `ip:${ip}`, 40);
    next(error instanceof AppError ? error : new AppError("Invalid API key", 401, "unauthorized"));
  }
}

export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const permissions = req.apiKey?.permissions ?? [];
    if (!permissions.includes(scope)) {
      return next(new AppError(`This API key is missing the ${scope} permission`, 403, "forbidden"));
    }
    req.apiPermission = scope;
    next();
  };
}
