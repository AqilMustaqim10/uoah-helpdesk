// Connection to PostgreSQL, plus a helper that runs several queries as ONE transaction.
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from "pg";
import { config } from "../config/env";

// Postgres returns BIGINT / COUNT(*) as text by default. Our ids are small,
// so convert them to normal numbers (type 20 = BIGINT).
types.setTypeParser(20, (v) => parseInt(v, 10));

/** The shared pool of database connections (max 10 at a time). */
export const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

// If an idle connection breaks, log it instead of crashing the whole server.
pool.on("error", (err) =>
  console.error("Unexpected database pool error:", err.message),
);

/** Anything that can run a query: the pool, or a client inside a transaction. */
export interface Db {
  query<R extends QueryResultRow = any>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>>;
}

/** Run a single query. ALWAYS pass values in `params` (never glue them into the text). */
export function query<R extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
) {
  return pool.query<R>(text, params);
}

/**
 * Run `fn` inside one transaction.
 * - Success: everything is saved together (COMMIT).
 * - Any error: everything is undone (ROLLBACK), so we never end up half-done.
 * Audit rows are written with the same client, so they succeed or fail with the action.
 */
export async function withTx<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    client.release(); // always give the connection back to the pool
  }
}
