import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { decryptSecret, like, parsePagination, publicRefillId } from "../utils.js";
import { writeAudit } from "./auditService.js";
import { notify } from "./notificationService.js";
import { getSmmAdapter } from "../providers/smm/index.js";
import { parseRefillHint } from "./refillParse.js";
import type { AuthUser } from "../middleware/auth.js";

const refillSelect = `
  r.*, o.public_id AS order_public_id, o.target, o.quantity, o.status AS order_status,
  o.provider_order_id, o.charge, o.created_at AS order_created_at, o.updated_at AS order_updated_at,
  p.name AS product_name, p.refill_supported, p.refill_days, p.refill_limit, p.refill_instructions,
  p.provider_refill_supported, p.refill_service_id, p.refill_type,
  pl.name AS platform_name, u.full_name AS customer_name, u.email AS customer_email,
  pr.name AS provider_name, pr.adapter, pr.api_url, pr.api_key_encrypted
`;

function mapProviderStatus(status: string) {
  const s = status.toLowerCase();
  if (["completed", "complete", "success", "ok"].includes(s)) return "completed";
  if (["failed", "error", "rejected", "canceled", "cancelled"].includes(s)) return "failed";
  if (["pending", "awaiting", "requested"].includes(s)) return "requested";
  return "processing";
}

export async function eligibilityForOrder(orderId: string) {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT o.*, p.refill_supported, p.refill_days, p.refill_limit, p.refill_instructions,
            p.provider_refill_supported, p.refill_service_id, p.name AS product_name,
            p.provider_id AS product_provider_id, p.api_available,
            (SELECT COUNT(*) FROM refills x WHERE x.order_id = o.id) AS refill_count,
            (SELECT status::text FROM refills x WHERE x.order_id = o.id ORDER BY created_at DESC LIMIT 1) AS latest_refill_status,
            (SELECT h.created_at FROM order_status_history h
              WHERE h.order_id = o.id AND h.to_status IN ('completed','partial')
              ORDER BY h.created_at DESC LIMIT 1) AS completed_at
     FROM orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.id::text = $1 OR o.public_id = $1`,
    [orderId]
  );
  if (!row) throw new AppError("Order not found", 404);
  return computeEligibility(row);
}

function computeEligibility(row: Record<string, unknown>) {
  const hint = parseRefillHint(String(row.product_name || row.name || ""), "", Boolean(row.refill_supported));
  const refillSupported = Boolean(row.refill_supported) || hint.supported;
  const days = Math.max(1, hint.fromName ? hint.days : Number(row.refill_days ?? hint.days ?? 30));
  const max = Math.max(1, Number(row.refill_limit ?? 1));
  const used = Number(row.refill_count ?? 0);
  const latest = String(row.latest_refill_status || "");
  const orderStatus = String(row.status || row.order_status || "");
  const target = String(row.target || "").trim();
  const completedAt = row.completed_at ? new Date(String(row.completed_at)) : new Date(String(row.updated_at || row.created_at));
  const expiresAt = new Date(completedAt.getTime() + days * 86400000);
  const expired = Date.now() > expiresAt.getTime();
  const active = latest === "requested" || latest === "processing";
  const eligibleStatus = orderStatus === "completed" || orderStatus === "partial";
  const reasons: string[] = [];
  if (!refillSupported) reasons.push("This service does not support refill.");
  if (!eligibleStatus) reasons.push("Refill is only available after the order is completed or partial.");
  if (!target || target.length < 3) reasons.push("The order target is missing.");
  if (expired) reasons.push("The refill period has expired.");
  if (used >= max) reasons.push("The maximum number of refills has been reached.");
  if (active) reasons.push("A refill is already in progress.");
  const eligible = reasons.length === 0;
  let display: string = "not_supported";
  if (!refillSupported) display = "not_supported";
  else if (latest === "processing") display = "processing";
  else if (latest === "requested") display = "requested";
  else if (latest === "failed" && eligible) display = "failed";
  else if (expired) display = "expired";
  else if (used >= max) display = "used";
  else if (latest === "completed" && eligible) display = "available";
  else if (eligible) display = "available";
  else if (latest === "failed") display = "failed";
  else if (latest === "completed") display = "used";
  return {
    eligible,
    reasons,
    display,
    refillSupported,
    refillDays: days,
    maxRefills: max,
    used,
    expiresAt: expiresAt.toISOString(),
    providerRefillSupported: Boolean(row.provider_refill_supported),
    productName: row.product_name,
  };
}

export function summarizeRefill(row: Record<string, unknown>) {
  return computeEligibility(row);
}

export async function attachOrderRefill(order: Record<string, unknown>) {
  const counts = await queryOne<{ count: string; latest: string | null }>(
    `SELECT COUNT(*)::text AS count,
            (SELECT status::text FROM refills WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1) AS latest
     FROM refills WHERE order_id = $1`,
    [order.id]
  );
  const completed = await queryOne<{ created_at: string }>(
    `SELECT created_at FROM order_status_history
     WHERE order_id = $1 AND to_status IN ('completed','partial')
     ORDER BY created_at DESC LIMIT 1`,
    [order.id]
  );
  const meta = computeEligibility({
    ...order,
    refill_count: Number(counts?.count ?? 0),
    latest_refill_status: counts?.latest,
    completed_at: completed?.created_at,
    order_status: order.status,
  });
  return { ...order, refill: meta };
}

export async function listRefills(opts: {
  user?: AuthUser;
  status?: string;
  search?: string;
  providerId?: string;
  platformId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { page, limit, offset } = parsePagination(opts as Record<string, unknown>);
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.user && opts.user.role !== "admin") {
    params.push(opts.user.id);
    where.push(`r.user_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`r.status = $${params.length}`);
  }
  if (opts.providerId) {
    params.push(opts.providerId);
    where.push(`r.provider_id::text = $${params.length}`);
  }
  if (opts.platformId) {
    params.push(opts.platformId);
    where.push(`p.platform_id::text = $${params.length}`);
  }
  if (opts.from) {
    params.push(opts.from);
    where.push(`r.requested_at >= $${params.length}::timestamptz`);
  }
  if (opts.to) {
    params.push(opts.to);
    where.push(`r.requested_at <= $${params.length}::timestamptz`);
  }
  const search = like(opts.search);
  if (search) {
    params.push(search);
    where.push(`(r.public_id ILIKE $${params.length} OR o.public_id ILIKE $${params.length} OR u.email ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM refills r
     JOIN orders o ON o.id = r.order_id
     JOIN products p ON p.id = r.product_id
     JOIN users u ON u.id = r.user_id
     ${whereSql}`,
    params
  );
  params.push(limit, offset);
  const items = await query(
    `SELECT ${refillSelect}
     FROM refills r
     JOIN orders o ON o.id = r.order_id
     JOIN products p ON p.id = r.product_id
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN users u ON u.id = r.user_id
     LEFT JOIN providers pr ON pr.id = r.provider_id
     ${whereSql}
     ORDER BY r.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items: items.map(sanitizeRefill), total: Number(count?.count ?? 0), page, limit };
}

export async function refillOverview() {
  const row = await queryOne<Record<string, string>>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'requested')::int AS requested,
       COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
       COUNT(*) FILTER (WHERE requested_at::date = CURRENT_DATE)::int AS today
     FROM refills`
  );
  return row ?? { total: 0, requested: 0, processing: 0, completed: 0, failed: 0, expired: 0, today: 0 };
}

export async function listOrderRefills(orderId: string) {
  const order = await queryOne<{ id: string }>(
    `SELECT id FROM orders WHERE id::text = $1 OR public_id = $1`,
    [orderId]
  );
  if (!order) return [];
  return query(
    `SELECT ${refillSelect}
     FROM refills r
     JOIN orders o ON o.id = r.order_id
     JOIN products p ON p.id = r.product_id
     JOIN platforms pl ON pl.id = p.platform_id
     JOIN users u ON u.id = r.user_id
     LEFT JOIN providers pr ON pr.id = r.provider_id
     WHERE r.order_id = $1
     ORDER BY r.created_at DESC`,
    [order.id]
  ).then((rows) => rows.map(sanitizeRefill));
}

export async function requestRefill(
  orderId: string,
  actor: AuthUser,
  ip?: string,
  note?: string,
  opts: { requireApi?: boolean } = {}
) {
  const order = await queryOne<Record<string, unknown>>(
    `SELECT o.*, p.refill_supported, p.refill_days, p.refill_limit, p.refill_instructions,
            p.provider_refill_supported, p.refill_service_id, p.name AS product_name, p.api_available,
            p.provider_id AS product_provider_id, pr.adapter, pr.api_url, pr.api_key_encrypted, pr.name AS provider_name,
            (SELECT COUNT(*) FROM refills x WHERE x.order_id = o.id) AS refill_count,
            (SELECT status::text FROM refills x WHERE x.order_id = o.id ORDER BY created_at DESC LIMIT 1) AS latest_refill_status,
            (SELECT h.created_at FROM order_status_history h
              WHERE h.order_id = o.id AND h.to_status IN ('completed','partial')
              ORDER BY h.created_at DESC LIMIT 1) AS completed_at
     FROM orders o
     JOIN products p ON p.id = o.product_id
     LEFT JOIN providers pr ON pr.id = COALESCE(o.provider_id, p.provider_id)
     WHERE o.id::text = $1 OR o.public_id = $1`,
    [orderId]
  );
  if (!order) throw new AppError("Order not found", 404);
  if (actor.role !== "admin" && String(order.user_id) !== actor.id) {
    throw new AppError("Order not found", 404);
  }
  if (opts.requireApi && !order.api_available) {
    throw new AppError("API refill is not enabled for this service", 403);
  }
  const check = computeEligibility(order);
  if (!check.eligible) throw new AppError(check.reasons[0] || "This order is not eligible for refill", 400);

  const expiresAt = check.expiresAt;
  const publicId = publicRefillId();
  const inserted = await queryOne<Record<string, unknown>>(
    `INSERT INTO refills (
       public_id, order_id, user_id, product_id, provider_id, status, expires_at, admin_note, requested_by
     ) VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8)
     RETURNING *`,
    [
      publicId,
      order.id,
      order.user_id,
      order.product_id,
      order.provider_id || order.product_provider_id || null,
      expiresAt,
      note ?? null,
      actor.id,
    ]
  );

  let status = "requested";
  let providerRefillId: string | null = null;
  let errorMessage: string | null = null;
  let adminNote = note ?? null;
  const providerSupports = Boolean(order.provider_refill_supported) && Boolean(order.provider_order_id);
  const adapter = getSmmAdapter(String(order.adapter || "mock"));

  if (providerSupports && adapter.requestRefill) {
    const apiKey = order.api_key_encrypted ? decryptSecret(String(order.api_key_encrypted)) : undefined;
    try {
      const result = await adapter.requestRefill(String(order.provider_order_id), {
        apiUrl: order.api_url as string | undefined,
        apiKey,
      });
      if (result.error && !result.refillId) {
        status = result.manual ? "requested" : "failed";
        errorMessage = result.error;
        adminNote = result.manual
          ? "Provider does not support automatic refill. Manual refill required."
          : result.error;
      } else if (result.manual) {
        status = "requested";
        adminNote = result.error || "Manual refill required.";
      } else {
        providerRefillId = result.refillId ?? null;
        status = mapProviderStatus(result.status);
      }
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : "Provider refill request failed";
    }
  } else {
    adminNote = "Manual refill required. Provider automatic refill is not enabled for this service.";
  }

  const processingAt = status === "processing" ? new Date() : null;
  const completedAt = status === "completed" ? new Date() : null;
  const failedAt = status === "failed" ? new Date() : null;
  const updated = await queryOne(
    `UPDATE refills SET
       status = $2::refill_status,
       provider_refill_id = $3,
       error_message = $4,
       admin_note = COALESCE($5, admin_note),
       processing_at = $6,
       completed_at = $7,
       failed_at = $8,
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [inserted!.id, status, providerRefillId, errorMessage, adminNote, processingAt, completedAt, failedAt]
  );

  await notify({
    userId: String(order.user_id),
    title: status === "failed" ? "Refill failed" : "Refill requested",
    body: status === "failed"
      ? `Refill for order ${order.public_id} failed: ${errorMessage || "provider rejected the request."}`
      : `A refill was requested for order ${order.public_id} (${order.product_name}).`,
    type: "order",
    metadata: { orderId: order.id, refillId: inserted!.id, status },
  });
  if (status === "failed") {
    await notify({
      userId: null,
      title: "Refill Failed",
      body: `Order ${order.public_id} · ${order.product_name}. ${errorMessage || "Provider rejected request."}`,
      type: "order",
      metadata: { orderId: order.id, refillId: inserted!.id },
    });
  }
  await writeAudit({
    actor,
    action: "refill.request",
    targetType: "refill",
    targetId: String(inserted!.id),
    details: { orderId: order.id, status, providerRefillId },
    ip,
  });
  return sanitizeRefill({ ...updated, order_public_id: order.public_id, product_name: order.product_name });
}

export async function retryRefill(id: string, actor: AuthUser, ip?: string) {
  const row = await queryOne<{ order_id: string }>(`SELECT order_id FROM refills WHERE id = $1`, [id]);
  if (!row) throw new AppError("Refill not found", 404);
  await query(`UPDATE refills SET status = 'failed', failed_at = NOW(), admin_note = COALESCE(admin_note, 'Superseded by retry') WHERE id = $1 AND status IN ('failed','requested')`, [id]);
  return requestRefill(row.order_id, actor, ip, "Retry");
}

export async function addRefillNote(id: string, note: string, actor: AuthUser, ip?: string) {
  const row = await queryOne(`UPDATE refills SET admin_note = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, note]);
  if (!row) throw new AppError("Refill not found", 404);
  await writeAudit({ actor, action: "refill.note", targetType: "refill", targetId: id, ip });
  return row;
}

export async function syncRefillStatuses() {
  const pending = await query<Record<string, unknown>>(
    `SELECT r.*, pr.adapter, pr.api_url, pr.api_key_encrypted
     FROM refills r
     LEFT JOIN providers pr ON pr.id = r.provider_id
     WHERE r.status IN ('requested','processing')
       AND r.provider_refill_id IS NOT NULL
     ORDER BY r.updated_at ASC
     LIMIT 40`
  );
  let updated = 0;
  for (const row of pending) {
    const adapter = getSmmAdapter(String(row.adapter || "mock"));
    if (!adapter.getRefillStatus) continue;
    const apiKey = row.api_key_encrypted ? decryptSecret(String(row.api_key_encrypted)) : undefined;
    try {
      const result = await adapter.getRefillStatus(String(row.provider_refill_id), {
        apiUrl: row.api_url as string | undefined,
        apiKey,
      });
      const status = mapProviderStatus(result.status);
      if (status === String(row.status)) continue;
      await query(
        `UPDATE refills SET
           status = $2::refill_status,
           error_message = $3,
           processing_at = CASE WHEN $2 = 'processing' THEN COALESCE(processing_at, NOW()) ELSE processing_at END,
           completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
           failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE failed_at END,
           updated_at = NOW()
         WHERE id = $1`,
        [row.id, status, result.error ?? null]
      );
      updated += 1;
      if (status === "completed" || status === "failed") {
        await notify({
          userId: String(row.user_id),
          title: status === "completed" ? "Refill completed" : "Refill failed",
          body: `Refill ${row.public_id} is ${status}.`,
          type: "order",
          metadata: { refillId: row.id, orderId: row.order_id },
        });
      }
    } catch {
      /* keep current status; next poll retries */
    }
  }
  await query(
    `UPDATE refills SET status = 'expired', updated_at = NOW()
     WHERE status IN ('requested','processing') AND expires_at IS NOT NULL AND expires_at < NOW()`
  );
  return { checked: pending.length, updated };
}

function sanitizeRefill(row: Record<string, unknown>) {
  const refill = { ...row };
  delete refill.api_key_encrypted;
  delete refill.api_url;
  delete refill.adapter;
  return refill;
}
