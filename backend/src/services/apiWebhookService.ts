import { query, queryOne } from "../db.js";
import { decryptSecret, hmacSha256Hex } from "../utils.js";

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export async function enqueueOrderWebhook(orderId: string, event: string) {
  const order = await queryOne<Record<string, unknown>>(
    `SELECT o.id, o.public_id, o.status, o.source, o.user_id, o.quantity, o.charge, o.updated_at
     FROM orders o WHERE o.id = $1`,
    [orderId]
  );
  if (!order || order.source !== "api") return;

  const hooks = await query<Record<string, unknown>>(
    `SELECT w.* FROM api_webhooks w
     JOIN api_developers d ON d.id = w.developer_id
     WHERE w.user_id = $1 AND w.is_enabled = TRUE AND d.status = 'approved'`,
    [order.user_id]
  );

  const payload = {
    event,
    order_id: String(order.public_id),
    status: String(order.status),
    quantity: Number(order.quantity),
    charge: Number(order.charge),
    created_at: new Date().toISOString(),
  };

  for (const hook of hooks) {
    const events = Array.isArray(hook.events) ? hook.events.map(String) : [];
    if (events.length && !events.includes(event)) continue;
    const delivery = await queryOne<{ id: string }>(
      `INSERT INTO api_webhook_deliveries (webhook_id, developer_id, event, payload, status, next_retry_at)
       VALUES ($1,$2,$3,$4::jsonb,'pending', NOW())
       RETURNING id`,
      [hook.id, hook.developer_id, event, JSON.stringify(payload)]
    );
    if (delivery) {
      deliverOnce(delivery.id).catch((err) => console.error("Webhook delivery failed", err));
    }
  }
}

export async function syncWebhookDeliveries() {
  const due = await query<{ id: string }>(
    `SELECT id FROM api_webhook_deliveries
     WHERE status IN ('pending','failed')
       AND attempt_count < max_attempts
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT 25`
  );
  for (const row of due) {
    await deliverOnce(row.id);
  }
}

async function deliverOnce(deliveryId: string) {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT d.*, w.url, w.secret_encrypted, w.is_enabled
     FROM api_webhook_deliveries d
     JOIN api_webhooks w ON w.id = d.webhook_id
     WHERE d.id = $1`,
    [deliveryId]
  );
  if (!row) return;
  if (!row.is_enabled) {
    await query(`UPDATE api_webhook_deliveries SET status = 'skipped', error_message = 'Webhook disabled' WHERE id = $1`, [deliveryId]);
    return;
  }

  const body = JSON.stringify(row.payload);
  let secret = "";
  try {
    secret = decryptSecret(String(row.secret_encrypted));
  } catch {
    await query(
      `UPDATE api_webhook_deliveries SET status = 'failed', error_message = 'Webhook secret could not be read', attempt_count = attempt_count + 1 WHERE id = $1`,
      [deliveryId]
    );
    return;
  }

  const signature = hmacSha256Hex(secret, body);
  const attempt = Number(row.attempt_count) + 1;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(String(row.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LinkBoost-Webhooks/1.0",
        "X-LinkBoost-Event": String(row.event),
        "X-LinkBoost-Delivery": String(row.id),
        "X-LinkBoost-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = (await response.text().catch(() => "")).slice(0, 500);
    if (response.ok) {
      await query(
        `UPDATE api_webhook_deliveries SET
           status = 'delivered', attempt_count = $2, http_status = $3, response_body = $4,
           error_message = NULL, delivered_at = NOW(), next_retry_at = NULL
         WHERE id = $1`,
        [deliveryId, attempt, response.status, text]
      );
      return;
    }
    await markFailed(deliveryId, attempt, Number(row.max_attempts), response.status, text || `HTTP ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery failed";
    await markFailed(deliveryId, attempt, Number(row.max_attempts), null, message);
  }
}

async function markFailed(id: string, attempt: number, maxAttempts: number, httpStatus: number | null, error: string) {
  const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
  const done = attempt >= maxAttempts;
  await query(
    `UPDATE api_webhook_deliveries SET
       status = $2, attempt_count = $3, http_status = $4, error_message = $5,
       next_retry_at = CASE WHEN $6 THEN NULL ELSE NOW() + ($7 || ' milliseconds')::interval END
     WHERE id = $1`,
    [id, done ? "failed" : "failed", attempt, httpStatus, error.slice(0, 400), done, delay]
  );
}
