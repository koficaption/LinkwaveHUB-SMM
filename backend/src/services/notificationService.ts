import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import type { AuthUser } from "../middleware/auth.js";
import { writeAudit } from "./auditService.js";
import { safeHttpUrl } from "../utils.js";

export type BroadcastAudience = "customers" | "resellers" | "child_panels" | "all" | "user";

function recipientWhere(audience: BroadcastAudience, userId: string | undefined, startAt: number) {
  const params: unknown[] = [];
  let index = startAt;
  const next = (value: unknown) => {
    params.push(value);
    const placeholder = `$${index}`;
    index += 1;
    return placeholder;
  };
  const clauses = [`u.status = 'active'`, `u.role <> 'admin'`];
  if (audience === "user") {
    if (!userId) throw new AppError("Select a user to notify", 400);
    clauses.push(`u.id = ${next(userId)}`);
  } else if (audience === "customers") {
    clauses.push(`u.role = 'customer'`);
  } else if (audience === "resellers") {
    clauses.push(`u.role = 'reseller'`);
  } else if (audience === "child_panels") {
    clauses.push(`u.role = 'reseller'`);
    clauses.push(`EXISTS (SELECT 1 FROM resellers r WHERE r.user_id = u.id AND r.status = 'active')`);
  } else {
    clauses.push(`u.role IN ('customer', 'reseller')`);
  }
  return { sql: clauses.join(" AND "), params };
}

export async function notify(input: {
  userId?: string | null;
  title: string;
  body: string;
  type?: string;
  metadata?: unknown;
}) {
  await query(
    `INSERT INTO notifications (user_id, title, body, type, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.userId ?? null,
      input.title,
      input.body,
      input.type ?? "info",
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

export async function listNotifications(userId: string) {
  return query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
}

export async function markRead(id: string, userId: string) {
  await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function markAllRead(userId: string) {
  await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1`, [userId]);
}

export async function deleteNotification(id: string, userId: string) {
  const row = await queryOne(`DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  if (!row) throw new AppError("Notification not found", 404);
}

export async function deleteAllNotifications(userId: string) {
  await query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
}

export async function audienceCounts() {
  const row = await queryOne<{ customers: string; resellers: string; child_panels: string; all_users: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE u.role = 'customer')::text AS customers,
      COUNT(*) FILTER (WHERE u.role = 'reseller')::text AS resellers,
      COUNT(*) FILTER (
        WHERE u.role = 'reseller' AND EXISTS (
          SELECT 1 FROM resellers r WHERE r.user_id = u.id AND r.status = 'active'
        )
      )::text AS child_panels,
      COUNT(*) FILTER (WHERE u.role IN ('customer', 'reseller'))::text AS all_users
    FROM users u
    WHERE u.status = 'active' AND u.role <> 'admin'
  `);
  return {
    customers: Number(row?.customers ?? 0),
    resellers: Number(row?.resellers ?? 0),
    child_panels: Number(row?.child_panels ?? 0),
    all: Number(row?.all_users ?? 0),
  };
}

export async function listBroadcasts() {
  return query(
    `SELECT id, title, body, type, metadata, created_at
     FROM notifications
     WHERE type = 'broadcast' AND user_id IS NULL
     ORDER BY created_at DESC
     LIMIT 100`
  );
}

export async function broadcastNotification(input: {
  title: string;
  body: string;
  audience: BroadcastAudience;
  userId?: string;
  linkUrl?: string;
  linkLabel?: string;
  popup?: boolean;
  actor: AuthUser;
  ip?: string;
}) {
  const linkUrl = safeHttpUrl(input.linkUrl);
  const linkLabel = String(input.linkLabel ?? "").trim().slice(0, 80) || (linkUrl ? "Join channel" : undefined);
  const popup = input.popup !== false;
  const broadcastId = randomUUID();
  const { sql, params } = recipientWhere(input.audience, input.userId, 4);
  const recipientMeta = JSON.stringify({
    audience: input.audience,
    sentBy: input.actor.id,
    sentByName: input.actor.full_name,
    popup,
    broadcastId,
    ...(linkUrl ? { linkUrl, linkLabel } : {}),
  });

  const result = await withTransaction(async (client) => {
    const recipients = await query<{ id: string }>(
      `INSERT INTO notifications (user_id, title, body, type, metadata)
       SELECT u.id, $1, $2, 'admin', $3::jsonb
       FROM users u
       WHERE ${sql}
       RETURNING id`,
      [input.title, input.body, recipientMeta, ...params],
      client
    );
    if (!recipients.length) {
      throw new AppError("No matching recipients for that audience", 400);
    }
    const log = await queryOne<{
      id: string;
      title: string;
      body: string;
      type: string;
      metadata: unknown;
      created_at: string;
    }>(
      `INSERT INTO notifications (id, user_id, title, body, type, metadata)
       VALUES ($1, NULL, $2, $3, 'broadcast', $4::jsonb)
       RETURNING id, title, body, type, metadata, created_at`,
      [
        broadcastId,
        input.title,
        input.body,
        JSON.stringify({
          audience: input.audience,
          recipientCount: recipients.length,
          sentBy: input.actor.id,
          sentByName: input.actor.full_name,
          userId: input.userId ?? null,
          popup,
          broadcastId,
          ...(linkUrl ? { linkUrl, linkLabel } : {}),
        }),
      ],
      client
    );
    return { log, recipientCount: recipients.length };
  });

  await writeAudit({
    actor: input.actor,
    action: "notification.broadcast",
    targetType: "notification",
    targetId: result.log?.id,
    details: { audience: input.audience, recipientCount: result.recipientCount, title: input.title, popup, linkUrl: linkUrl ?? null },
    ip: input.ip,
  });

  return { ...result.log, recipientCount: result.recipientCount };
}

export async function deleteBroadcast(id: string, actor: AuthUser, ip?: string) {
  const row = await queryOne<{
    id: string;
    title: string;
    body: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>(
    `SELECT id, title, body, metadata, created_at
     FROM notifications
     WHERE id = $1 AND type = 'broadcast' AND user_id IS NULL`,
    [id]
  );
  if (!row) throw new AppError("Notification not found", 404);

  const sentBy = typeof row.metadata?.sentBy === "string" ? row.metadata.sentBy : "";
  const retracted = await withTransaction(async (client) => {
    const copies = await query<{ id: string }>(
      `DELETE FROM notifications
       WHERE type = 'admin'
         AND (
           metadata->>'broadcastId' = $1::text
           OR (
             COALESCE(metadata->>'broadcastId', '') = ''
             AND title = $2
             AND body = $3
             AND COALESCE(metadata->>'sentBy', '') = $4
             AND created_at BETWEEN $5::timestamptz - interval '2 minutes'
                               AND $5::timestamptz + interval '2 minutes'
           )
         )
       RETURNING id`,
      [id, row.title, row.body, sentBy, row.created_at],
      client
    );
    await query(`DELETE FROM notifications WHERE id = $1`, [id], client);
    return copies.length;
  });

  await writeAudit({
    actor,
    action: "notification.delete",
    targetType: "notification",
    targetId: id,
    details: { title: row.title, retracted },
    ip,
  });
  return { deleted: true, retracted };
}
