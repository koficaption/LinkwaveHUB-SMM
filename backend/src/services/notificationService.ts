import { query } from "../db.js";

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

export async function listNotifications(userId: string, role: string) {
  if (role === "admin") {
    return query(
      `SELECT n.*, u.full_name AS user_name, u.email AS user_email
       FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id
       ORDER BY n.created_at DESC
       LIMIT 200`
    );
  }
  return query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
}

export async function markRead(id: string, userId: string, role: string) {
  if (role === "admin") {
    await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [id]);
    return;
  }
  await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function markAllRead(userId: string) {
  await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1`, [userId]);
}
