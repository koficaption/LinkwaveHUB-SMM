import { query } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

export async function writeAudit(input: {
  actor?: AuthUser | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: unknown;
  ip?: string;
  userAgent?: string;
}) {
  await query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      input.actor?.id ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.details ?? {}),
      input.ip ?? null,
      input.userAgent ?? null,
    ]
  );
}
