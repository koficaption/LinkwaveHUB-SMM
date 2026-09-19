import { query, queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { publicTicketId } from "../utils.js";
import { notify } from "./notificationService.js";
import type { AuthUser } from "../middleware/auth.js";

export async function createTicket(user: AuthUser, input: { subject: string; category: string; message: string; priority?: string }) {
  const ticket = await queryOne(
    `INSERT INTO support_tickets (public_id, user_id, subject, category, priority, status)
     VALUES ($1,$2,$3,$4,$5,'open') RETURNING *`,
    [publicTicketId(), user.id, input.subject, input.category, input.priority ?? "medium"]
  );
  await query(
    `INSERT INTO support_messages (ticket_id, user_id, message, is_staff) VALUES ($1,$2,$3,FALSE)`,
    [ticket!.id, user.id, input.message]
  );
  await notify({
    userId: null,
    title: "New support ticket",
    body: `${user.full_name}: ${input.subject}`,
    type: "support",
    metadata: { ticketId: ticket!.id },
  });
  return getTicket(ticket!.id, user);
}

export async function listTickets(user: AuthUser, status?: string) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (user.role !== "admin") {
    params.push(user.id);
    where.push(`t.user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`t.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return query(
    `SELECT t.*, u.full_name, u.email,
      (SELECT COUNT(*)::int FROM support_messages m WHERE m.ticket_id = t.id) AS message_count
     FROM support_tickets t JOIN users u ON u.id = t.user_id
     ${whereSql}
     ORDER BY t.updated_at DESC`,
    params
  );
}

export async function getTicket(id: string, user: AuthUser) {
  const ticket = await queryOne(
    `SELECT t.*, u.full_name, u.email FROM support_tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.id::text = $1 OR t.public_id = $1`,
    [id]
  );
  if (!ticket) throw new AppError("Ticket not found", 404);
  if (user.role !== "admin" && ticket.user_id !== user.id) throw new AppError("Ticket not found", 404);
  const messages = await query(
    `SELECT m.*, u.full_name, u.role FROM support_messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`,
    [ticket.id]
  );
  return { ticket, messages };
}

export async function replyTicket(id: string, user: AuthUser, message: string) {
  const current = await getTicket(id, user);
  await query(
    `INSERT INTO support_messages (ticket_id, user_id, message, is_staff) VALUES ($1,$2,$3,$4)`,
    [current.ticket.id, user.id, message, user.role === "admin"]
  );
  const nextStatus = user.role === "admin" ? "pending" : "open";
  await query(`UPDATE support_tickets SET status = $2 WHERE id = $1`, [current.ticket.id, nextStatus]);
  await notify({
    userId: user.role === "admin" ? current.ticket.user_id : null,
    title: "Support reply",
    body: `New reply on ticket ${current.ticket.public_id}`,
    type: "support",
  });
  return getTicket(id, user);
}

export async function updateTicket(id: string, input: { status?: string; priority?: string; assignedTo?: string | null }, user: AuthUser) {
  const ticket = await queryOne(
    `UPDATE support_tickets SET
      status = COALESCE($2, status),
      priority = COALESCE($3, priority),
      assigned_to = COALESCE($4, assigned_to)
     WHERE id = $1 RETURNING *`,
    [id, input.status ?? null, input.priority ?? null, input.assignedTo ?? null]
  );
  if (!ticket) throw new AppError("Ticket not found", 404);
  return getTicket(id, user);
}
