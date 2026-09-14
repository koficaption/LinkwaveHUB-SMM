import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

function sslFor(url: string) {
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") return undefined;
  } catch {
    if (!url.includes("supabase") && !url.includes("sslmode=require")) return undefined;
  }
  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  ssl: sslFor(config.databaseUrl),
});

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool
): Promise<T[]> {
  const result = await client.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
