/**
 * api/src/lib/db.ts — Postgres connection pool.
 *
 * Creates a shared pg.Pool; connection parameters come from app-settings
 * (KV-referenced PGPASSWORD when password auth is used, or managed-identity
 * token exchange if Entra auth is configured — plan 11 / plan 20 §2).
 *
 * TODO (api-build agent): if using Entra/MI auth (no static password), add the
 * azure-identity token refresh hook on the pool (beforeAcquire).
 */

import { Pool } from 'pg';

let _pool: Pool | undefined;

/**
 * Returns the shared connection pool, creating it on first call.
 * Uses PGHOST / PGDATABASE / PGUSER / PGPASSWORD / PGSSLMODE from process.env
 * (set via app-settings on the Function App; locally via local.settings.json).
 */
export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE !== 'disable' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    _pool.on('error', (err) => {
      // Log pool errors; the pool will attempt to reconnect automatically.
      console.error('[db] pool error', err);
    });
  }
  return _pool;
}

/**
 * Execute a query on the shared pool.
 * Helper to avoid boilerplate `.connect()` / release patterns in handlers.
 */
export async function query<T extends Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}
