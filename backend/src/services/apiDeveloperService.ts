import crypto from "node:crypto";
import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { encryptSecret, parsePagination, sha256Hex } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { getSettings } from "./settingsService.js";
import type { AuthUser } from "../middleware/auth.js";
import { API_SCOPES } from "../validators.js";

export const WEBHOOK_EVENTS = [
  "order.created",
  "order.processing",
  "order.completed",
  "order.partial",
  "order.failed",
  "order.refunded",
  "order.cancelled",
] as const;

const DEFAULT_PERMISSIONS = [...API_SCOPES];

type ApiSettings = {
  enabled: boolean;
  defaultRateLimit: number;
  resellerRateLimit: number;
  premiumRateLimit: number;
  requireHttpsWebhooks: boolean;
  maxKeysPerDeveloper: number;
  maxWebhooksPerDeveloper: number;
};

export async function getApiSettings(): Promise<ApiSettings> {
  const all = await getSettings();
  const api = (all.api ?? {}) as Partial<ApiSettings>;
  return {
    enabled: api.enabled !== false,
    defaultRateLimit: Number(api.defaultRateLimit ?? 100) || 100,
    resellerRateLimit: Number(api.resellerRateLimit ?? 500) || 500,
    premiumRateLimit: Number(api.premiumRateLimit ?? 2000) || 2000,
    requireHttpsWebhooks: api.requireHttpsWebhooks !== false,
    maxKeysPerDeveloper: Number(api.maxKeysPerDeveloper ?? 10) || 10,
    maxWebhooksPerDeveloper: Number(api.maxWebhooksPerDeveloper ?? 5) || 5,
  };
}

function planLimit(plan: string, settings: ApiSettings) {
  if (plan === "premium") return settings.premiumRateLimit;
  if (plan === "reseller") return settings.resellerRateLimit;
  return settings.defaultRateLimit;
}

function publicDeveloper(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    plan: row.plan,
    applicant_name: row.applicant_name,
    applicant_email: row.applicant_email,
    company_name: row.company_name,
    website_url: row.website_url,
    intended_usage: row.intended_usage,
    expected_monthly_requests: row.expected_monthly_requests,
    rate_limit_per_minute: row.rate_limit_per_minute,
    allowed_ips: row.allowed_ips ?? [],
    admin_note: row.admin_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    reviewed_at: row.reviewed_at,
  };
}

function publicKey(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    status: row.status,
    permissions: row.permissions,
    allowed_ips: row.allowed_ips ?? [],
    last_used_at: row.last_used_at,
    last_used_ip: row.last_used_ip,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revoked_at: row.revoked_at,
  };
}

export async function getMyDeveloper(userId: string) {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM api_developers WHERE user_id = $1`,
    [userId]
  );
  if (!row) return null;
  return publicDeveloper(row);
}

export async function applyForApi(user: AuthUser, input: Record<string, unknown>) {
  const settings = await getApiSettings();
  if (!settings.enabled) throw new AppError("API access applications are currently closed", 403);

  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM api_developers WHERE user_id = $1`,
    [user.id]
  );
  if (existing && ["pending", "approved"].includes(String(existing.status))) {
    throw new AppError("You already have an API access application", 400);
  }

  const website = String(input.websiteUrl || input.website || "").trim();
  if (website.length < 2) throw new AppError("Enter the name of your website", 400);
  const plan = user.role === "reseller" || user.role === "admin" ? "reseller" : "free";
  const rate = planLimit(plan, settings);
  const name = String(input.name || user.full_name || "API developer").trim();
  const email = String(input.email || user.email).trim().toLowerCase();
  const intended = String(input.intendedUsage || `Website: ${website}`).trim();

  const row = existing
    ? await queryOne<Record<string, unknown>>(
        `UPDATE api_developers SET
           status = 'pending', plan = $2, applicant_name = $3, applicant_email = $4,
           company_name = $5, website_url = $6, intended_usage = $7,
           expected_monthly_requests = $8, rate_limit_per_minute = $9,
           admin_note = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          existing.id,
          plan,
          name,
          email,
          input.companyName ?? null,
          website,
          intended,
          input.expectedMonthlyRequests ?? 10000,
          rate,
        ]
      )
    : await queryOne<Record<string, unknown>>(
        `INSERT INTO api_developers (
           user_id, status, plan, applicant_name, applicant_email, company_name,
           website_url, intended_usage, expected_monthly_requests, rate_limit_per_minute
         ) VALUES ($1,'pending',$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          user.id,
          plan,
          name,
          email,
          input.companyName ?? null,
          website,
          intended,
          input.expectedMonthlyRequests ?? 10000,
          rate,
        ]
      );

  await notify({
    userId: null,
    title: "API access application",
    body: `${user.full_name} applied for API developer access.`,
    type: "system",
    metadata: { developerId: row!.id, userId: user.id },
  });
  await writeAudit({
    actor: user,
    action: "api.apply",
    targetType: "api_developer",
    targetId: String(row!.id),
  });
  return publicDeveloper(row!);
}

async function requireApprovedDeveloper(userId: string) {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM api_developers WHERE user_id = $1`,
    [userId]
  );
  if (!row) throw new AppError("Apply for API access first", 403);
  if (row.status === "pending") throw new AppError("Your API application is still under review", 403);
  if (row.status === "rejected") throw new AppError("Your API application was not approved", 403);
  if (row.status === "suspended") throw new AppError("API access is suspended", 403);
  if (row.status !== "approved") throw new AppError("API access is not available", 403);
  return row;
}

function generateApiSecret() {
  const raw = crypto.randomBytes(24).toString("hex");
  const secret = `lbk_live_${raw}`;
  return { secret, prefix: secret.slice(0, 17), hash: sha256Hex(secret) };
}

export async function listMyKeys(userId: string) {
  const developer = await getMyDeveloper(userId);
  if (!developer) return [];
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM api_keys WHERE developer_id = $1 ORDER BY created_at DESC`,
    [developer.id]
  );
  return rows.map(publicKey);
}

export async function createApiKey(user: AuthUser, input: { name: string; permissions?: string[]; allowedIps?: string[] }) {
  const developer = await requireApprovedDeveloper(user.id);
  const settings = await getApiSettings();
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM api_keys WHERE developer_id = $1 AND status <> 'revoked'`,
    [developer.id]
  );
  if (Number(count?.count ?? 0) >= settings.maxKeysPerDeveloper) {
    throw new AppError(`You can create at most ${settings.maxKeysPerDeveloper} API keys`, 400);
  }

  const { secret, prefix, hash } = generateApiSecret();
  const permissions = input.permissions?.length ? input.permissions : DEFAULT_PERMISSIONS;
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO api_keys (developer_id, user_id, name, key_prefix, secret_hash, permissions, allowed_ips)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     RETURNING *`,
    [developer.id, user.id, input.name, prefix, hash, JSON.stringify(permissions), input.allowedIps ?? []]
  );
  await writeAudit({ actor: user, action: "api.key.create", targetType: "api_key", targetId: String(row!.id) });
  return { ...publicKey(row!), secret };
}

export async function updateApiKey(user: AuthUser, id: string, input: Record<string, unknown>) {
  const key = await queryOne<Record<string, unknown>>(
    `SELECT * FROM api_keys WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  );
  if (!key) throw new AppError("API key not found", 404);
  if (key.status === "revoked") throw new AppError("This API key has been revoked", 400);
  await query(
    `UPDATE api_keys SET
       name = COALESCE($2, name),
       status = COALESCE($3, status),
       permissions = COALESCE($4::jsonb, permissions),
       allowed_ips = COALESCE($5, allowed_ips),
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      input.name ?? null,
      input.status ?? null,
      input.permissions ? JSON.stringify(input.permissions) : null,
      input.allowedIps ?? null,
    ]
  );
  const updated = await queryOne<Record<string, unknown>>(`SELECT * FROM api_keys WHERE id = $1`, [id]);
  return publicKey(updated!);
}

export async function revokeApiKey(user: AuthUser, id: string, admin = false) {
  const key = await queryOne<Record<string, unknown>>(
    admin
      ? `SELECT * FROM api_keys WHERE id = $1`
      : `SELECT * FROM api_keys WHERE id = $1 AND user_id = $2`,
    admin ? [id] : [id, user.id]
  );
  if (!key) throw new AppError("API key not found", 404);
  await query(
    `UPDATE api_keys SET status = 'revoked', revoked_at = NOW(), revoked_by = $2, updated_at = NOW() WHERE id = $1`,
    [id, user.id]
  );
  await writeAudit({ actor: user, action: "api.key.revoke", targetType: "api_key", targetId: id });
  const updated = await queryOne<Record<string, unknown>>(`SELECT * FROM api_keys WHERE id = $1`, [id]);
  return publicKey(updated!);
}

export async function regenerateApiKey(user: AuthUser, id: string) {
  await requireApprovedDeveloper(user.id);
  const key = await queryOne<Record<string, unknown>>(
    `SELECT * FROM api_keys WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  );
  if (!key) throw new AppError("API key not found", 404);
  if (key.status === "revoked") throw new AppError("This API key has been revoked", 400);
  const { secret, prefix, hash } = generateApiSecret();
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE api_keys SET key_prefix = $2, secret_hash = $3, status = 'active', revoked_at = NULL, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, prefix, hash]
  );
  await writeAudit({ actor: user, action: "api.key.regenerate", targetType: "api_key", targetId: id });
  return { ...publicKey(row!), secret };
}

export async function updateMyDeveloperSettings(user: AuthUser, input: { allowedIps?: string[] }) {
  const developer = await requireApprovedDeveloper(user.id);
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE api_developers SET allowed_ips = COALESCE($2, allowed_ips), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [developer.id, input.allowedIps ?? null]
  );
  return publicDeveloper(row!);
}

function generateWebhookSecret() {
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  return { secret, prefix: secret.slice(0, 14), encrypted: encryptSecret(secret) };
}

export async function listMyWebhooks(userId: string) {
  const developer = await getMyDeveloper(userId);
  if (!developer) return [];
  return query(
    `SELECT id, url, description, secret_prefix, events, is_enabled, created_at, updated_at
     FROM api_webhooks WHERE developer_id = $1 ORDER BY created_at DESC`,
    [developer.id]
  );
}

export async function createWebhook(user: AuthUser, input: { url: string; description?: string; events?: string[]; isEnabled?: boolean }) {
  const developer = await requireApprovedDeveloper(user.id);
  const settings = await getApiSettings();
  assertWebhookUrl(input.url, settings);
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM api_webhooks WHERE developer_id = $1`,
    [developer.id]
  );
  if (Number(count?.count ?? 0) >= settings.maxWebhooksPerDeveloper) {
    throw new AppError(`You can register at most ${settings.maxWebhooksPerDeveloper} webhooks`, 400);
  }
  const events = normalizeEvents(input.events);
  const { secret, prefix, encrypted } = generateWebhookSecret();
  const row = await queryOne(
    `INSERT INTO api_webhooks (developer_id, user_id, url, description, secret_encrypted, secret_prefix, events, is_enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     RETURNING id, url, description, secret_prefix, events, is_enabled, created_at, updated_at`,
    [
      developer.id,
      user.id,
      input.url,
      input.description ?? null,
      encrypted,
      prefix,
      JSON.stringify(events),
      input.isEnabled !== false,
    ]
  );
  return { ...row, secret };
}

export async function updateWebhook(user: AuthUser, id: string, input: Record<string, unknown>) {
  const webhook = await queryOne(`SELECT * FROM api_webhooks WHERE id = $1 AND user_id = $2`, [id, user.id]);
  if (!webhook) throw new AppError("Webhook not found", 404);
  if (input.url) assertWebhookUrl(String(input.url), await getApiSettings());
  const events = input.events ? normalizeEvents(input.events as string[]) : null;
  const row = await queryOne(
    `UPDATE api_webhooks SET
       url = COALESCE($2, url),
       description = COALESCE($3, description),
       events = COALESCE($4::jsonb, events),
       is_enabled = COALESCE($5, is_enabled),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, url, description, secret_prefix, events, is_enabled, created_at, updated_at`,
    [id, input.url ?? null, input.description ?? null, events ? JSON.stringify(events) : null, input.isEnabled ?? null]
  );
  return row;
}

export async function deleteWebhook(user: AuthUser, id: string) {
  const webhook = await queryOne(`SELECT id FROM api_webhooks WHERE id = $1 AND user_id = $2`, [id, user.id]);
  if (!webhook) throw new AppError("Webhook not found", 404);
  await query(`DELETE FROM api_webhooks WHERE id = $1`, [id]);
  return { deleted: true };
}

export async function rotateWebhookSecret(user: AuthUser, id: string) {
  const webhook = await queryOne(`SELECT id FROM api_webhooks WHERE id = $1 AND user_id = $2`, [id, user.id]);
  if (!webhook) throw new AppError("Webhook not found", 404);
  const { secret, prefix, encrypted } = generateWebhookSecret();
  const row = await queryOne(
    `UPDATE api_webhooks SET secret_encrypted = $2, secret_prefix = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING id, url, description, secret_prefix, events, is_enabled, created_at, updated_at`,
    [id, encrypted, prefix]
  );
  return { ...row, secret };
}

export async function listWebhookDeliveries(userId: string, webhookId: string, page = 1, limit = 20) {
  const webhook = await queryOne(`SELECT id FROM api_webhooks WHERE id = $1 AND user_id = $2`, [webhookId, userId]);
  if (!webhook) throw new AppError("Webhook not found", 404);
  const p = parsePagination({ page, limit });
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM api_webhook_deliveries WHERE webhook_id = $1`,
    [webhookId]
  );
  const items = await query(
    `SELECT id, event, status, attempt_count, http_status, error_message, delivered_at, created_at, next_retry_at
     FROM api_webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [webhookId, p.limit, p.offset]
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function listMyLogs(userId: string, opts: { page?: number; limit?: number; status?: string } = {}) {
  const developer = await getMyDeveloper(userId);
  if (!developer) return { items: [], total: 0, page: 1, limit: 20 };
  const p = parsePagination(opts);
  const params: unknown[] = [developer.id];
  const where = [`developer_id = $1`];
  if (opts.status === "success") where.push(`status_code < 400`);
  if (opts.status === "failed") where.push(`status_code >= 400`);
  const whereSql = where.join(" AND ");
  const count = await queryOne<{ count: string }>(`SELECT COUNT(*) FROM api_request_logs WHERE ${whereSql}`, params);
  params.push(p.limit, p.offset);
  const items = await query(
    `SELECT request_id, method, path, status_code, duration_ms, ip_address, created_at
     FROM api_request_logs WHERE ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function myUsage(userId: string) {
  const developer = await getMyDeveloper(userId);
  if (!developer) {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      today: 0,
      month: 0,
      orders: 0,
      revenue: 0,
      avg_response_ms: 0,
      error_rate: 0,
      series: [] as { label: string; requests: number; errors: number }[],
    };
  }
  const stats = await queryOne<Record<string, string>>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status_code < 400)::int AS successful,
       COUNT(*) FILTER (WHERE status_code >= 400)::int AS failed,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS month,
       COALESCE(AVG(duration_ms), 0)::int AS avg_response_ms
     FROM api_request_logs WHERE developer_id = $1`,
    [developer.id]
  );
  const orderStats = await queryOne<{ orders: string; revenue: string }>(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(charge),0) AS revenue
     FROM orders WHERE user_id = $1 AND source = 'api'`,
    [userId]
  );
  const series = await query<{ label: string; requests: number; errors: number }>(
    `SELECT to_char(created_at::date, 'Mon DD') AS label,
            COUNT(*)::int AS requests,
            COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
     FROM api_request_logs
     WHERE developer_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
     GROUP BY created_at::date
     ORDER BY created_at::date`,
    [developer.id]
  );
  const total = Number(stats?.total ?? 0);
  const failed = Number(stats?.failed ?? 0);
  return {
    total,
    successful: Number(stats?.successful ?? 0),
    failed,
    today: Number(stats?.today ?? 0),
    month: Number(stats?.month ?? 0),
    orders: Number(orderStats?.orders ?? 0),
    revenue: Number(orderStats?.revenue ?? 0),
    avg_response_ms: Number(stats?.avg_response_ms ?? 0),
    error_rate: total ? Number(((failed / total) * 100).toFixed(2)) : 0,
    series,
  };
}

export async function listDevelopersAdmin(opts: { status?: string; search?: string; page?: number; limit?: number } = {}) {
  const p = parsePagination(opts);
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`d.status = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(d.applicant_name ILIKE $${params.length} OR d.applicant_email ILIKE $${params.length} OR u.email ILIKE $${params.length} OR d.company_name ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM api_developers d JOIN users u ON u.id = d.user_id ${whereSql}`,
    params
  );
  params.push(p.limit, p.offset);
  const items = await query(
    `SELECT d.*, u.email AS user_email, u.full_name AS user_name, u.role AS user_role, u.status AS user_status,
            (SELECT COUNT(*)::int FROM api_keys k WHERE k.developer_id = d.id AND k.status = 'active') AS active_keys,
            (SELECT COUNT(*)::int FROM api_request_logs l WHERE l.developer_id = d.id AND l.created_at >= CURRENT_DATE) AS requests_today
     FROM api_developers d
     JOIN users u ON u.id = d.user_id
     ${whereSql}
     ORDER BY d.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function setDeveloperStatus(id: string, status: "approved" | "rejected" | "suspended" | "approved_reactivate", actor: AuthUser, ip?: string) {
  const current = await queryOne<Record<string, unknown>>(`SELECT * FROM api_developers WHERE id = $1`, [id]);
  if (!current) throw new AppError("API developer not found", 404);
  const next = status === "approved_reactivate" ? "approved" : status;
  const settings = await getApiSettings();
  let rate = Number(current.rate_limit_per_minute);
  let plan = String(current.plan);
  if (next === "approved") {
    const user = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [current.user_id]);
    if (user?.role === "reseller" || user?.role === "admin") plan = "reseller";
    if (!rate || status === "approved") rate = planLimit(plan, settings);
  }
  await query(
    `UPDATE api_developers SET status = $2, plan = $3, rate_limit_per_minute = $4, reviewed_by = $5, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id, next, plan, rate, actor.id]
  );
  if (next === "suspended" || next === "rejected") {
    await query(`UPDATE api_keys SET status = 'disabled', updated_at = NOW() WHERE developer_id = $1 AND status = 'active'`, [id]);
  }
  if (next === "approved") {
    await query(
      `UPDATE api_keys SET status = 'active', updated_at = NOW()
       WHERE developer_id = $1 AND status = 'disabled' AND revoked_at IS NULL`,
      [id]
    );
  }
  await notify({
    userId: String(current.user_id),
    title: next === "approved" ? "API access approved" : next === "rejected" ? "API access rejected" : "API access updated",
    body:
      next === "approved"
        ? "You can now create production API keys in the developer portal."
        : next === "rejected"
          ? "Your API access application was not approved."
          : "Your API access status was updated.",
    type: "system",
  });
  await writeAudit({ actor, action: `api.developer.${next}`, targetType: "api_developer", targetId: id, ip });
  return queryOne(`SELECT * FROM api_developers WHERE id = $1`, [id]);
}

export async function patchDeveloperAdmin(id: string, input: Record<string, unknown>, actor: AuthUser, ip?: string) {
  const current = await queryOne(`SELECT * FROM api_developers WHERE id = $1`, [id]);
  if (!current) throw new AppError("API developer not found", 404);
  const settings = await getApiSettings();
  let rate = input.rateLimitPerMinute as number | undefined;
  const plan = (input.plan as string | undefined) ?? undefined;
  if (plan && rate == null) rate = planLimit(plan, settings);
  await query(
    `UPDATE api_developers SET
       plan = COALESCE($2, plan),
       rate_limit_per_minute = COALESCE($3, rate_limit_per_minute),
       admin_note = COALESCE($4, admin_note),
       allowed_ips = COALESCE($5, allowed_ips),
       updated_at = NOW()
     WHERE id = $1`,
    [id, plan ?? null, rate ?? null, input.adminNote ?? null, input.allowedIps ?? null]
  );
  await writeAudit({ actor, action: "api.developer.update", targetType: "api_developer", targetId: id, ip });
  return queryOne(`SELECT * FROM api_developers WHERE id = $1`, [id]);
}

export async function listKeysAdmin(opts: { search?: string; page?: number; limit?: number } = {}) {
  const p = parsePagination(opts);
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.search) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(k.name ILIKE $${params.length} OR k.key_prefix ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM api_keys k JOIN users u ON u.id = k.user_id ${whereSql}`,
    params
  );
  params.push(p.limit, p.offset);
  const items = await query(
    `SELECT k.id, k.name, k.key_prefix, k.status, k.permissions, k.last_used_at, k.created_at, k.revoked_at,
            u.email AS user_email, u.full_name AS user_name, d.status AS developer_status
     FROM api_keys k
     JOIN users u ON u.id = k.user_id
     JOIN api_developers d ON d.id = k.developer_id
     ${whereSql}
     ORDER BY k.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function listRequestsAdmin(opts: { page?: number; limit?: number; developerId?: string } = {}) {
  const p = parsePagination(opts);
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.developerId) {
    params.push(opts.developerId);
    where.push(`l.developer_id = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM api_request_logs l ${whereSql}`,
    params
  );
  params.push(p.limit, p.offset);
  const items = await query(
    `SELECT l.request_id, l.method, l.path, l.status_code, l.duration_ms, l.ip_address, l.created_at,
            k.key_prefix, u.email AS user_email
     FROM api_request_logs l
     LEFT JOIN api_keys k ON k.id = l.api_key_id
     LEFT JOIN users u ON u.id = l.user_id
     ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

export async function adminApiOverview() {
  const row = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM api_developers) AS developers,
       (SELECT COUNT(*) FROM api_developers WHERE status = 'pending') AS pending,
       (SELECT COUNT(*) FROM api_developers WHERE status = 'approved') AS approved,
       (SELECT COUNT(*) FROM api_keys WHERE status = 'active') AS active_keys,
       (SELECT COUNT(*) FROM api_request_logs WHERE created_at >= CURRENT_DATE) AS requests_today,
       (SELECT COUNT(*) FROM api_request_logs) AS requests_total,
       (SELECT COUNT(*) FROM orders WHERE source = 'api') AS api_orders,
       (SELECT COALESCE(SUM(charge),0) FROM orders WHERE source = 'api') AS api_revenue,
       (SELECT COUNT(*) FROM api_webhooks WHERE is_enabled = TRUE) AS webhooks
    `
  );
  return {
    developers: Number(row?.developers ?? 0),
    pending: Number(row?.pending ?? 0),
    approved: Number(row?.approved ?? 0),
    active_keys: Number(row?.active_keys ?? 0),
    requests_today: Number(row?.requests_today ?? 0),
    requests_total: Number(row?.requests_total ?? 0),
    api_orders: Number(row?.api_orders ?? 0),
    api_revenue: Number(row?.api_revenue ?? 0),
    webhooks: Number(row?.webhooks ?? 0),
  };
}

export async function listWebhooksAdmin(opts: { page?: number; limit?: number } = {}) {
  const p = parsePagination(opts);
  const count = await queryOne<{ count: string }>(`SELECT COUNT(*) FROM api_webhooks`);
  const items = await query(
    `SELECT w.id, w.url, w.secret_prefix, w.events, w.is_enabled, w.created_at, u.email AS user_email,
            (SELECT COUNT(*)::int FROM api_webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed_deliveries
     FROM api_webhooks w
     JOIN users u ON u.id = w.user_id
     ORDER BY w.created_at DESC
     LIMIT $1 OFFSET $2`,
    [p.limit, p.offset]
  );
  return { items, total: Number(count?.count ?? 0), page: p.page, limit: p.limit };
}

function normalizeEvents(events?: string[]) {
  const allowed = new Set<string>(WEBHOOK_EVENTS);
  const next = (events?.length ? events : [...WEBHOOK_EVENTS]).filter((event) => allowed.has(event));
  if (!next.length) throw new AppError("Select at least one valid webhook event");
  return next;
}

function assertWebhookUrl(url: string, settings: ApiSettings) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("Enter a valid webhook URL");
  }
  if (!["https:", "http:"].includes(parsed.protocol)) throw new AppError("Webhook URL must be http or https");
  if (settings.requireHttpsWebhooks && parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new AppError("Webhook URLs must use HTTPS");
  }
}
