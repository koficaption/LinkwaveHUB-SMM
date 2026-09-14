import type { Queryable } from "../db.js";
import { queryOne } from "../db.js";
import { AppError } from "../errors.js";
import { newDepositCode } from "../utils.js";

export async function ensureDepositCode(userId: string, client?: Queryable): Promise<string> {
  const row = await queryOne<{ deposit_code: string | null }>(
    `SELECT deposit_code FROM users WHERE id = $1`,
    [userId],
    client
  );
  if (row?.deposit_code) return row.deposit_code;
  for (let i = 0; i < 8; i++) {
    const code = newDepositCode();
    try {
      const updated = await queryOne<{ deposit_code: string }>(
        `UPDATE users SET deposit_code = $2 WHERE id = $1 AND deposit_code IS NULL RETURNING deposit_code`,
        [userId, code],
        client
      );
      if (updated?.deposit_code) return updated.deposit_code;
    } catch {
      /* unique collision, retry */
    }
  }
  throw new AppError("Could not allocate a payment code", 500);
}
