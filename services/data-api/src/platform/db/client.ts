/**
 * services/data-api/src/platform/db/client.ts — Postgres connection pool.
 *
 * Creates a shared pg.Pool; connection parameters come from app-settings
 * (KV-referenced PGPASSWORD when password auth is used, or managed-identity
 * token exchange if Entra auth is configured — plan 11 / plan 20 §2).
 *
 * RLS / least-privilege (900_constraints.sql, 31-auth-migration.md):
 *   The API connects as the NON-OWNER login `cespk_app` (NOSUPERUSER, NOBYPASSRLS),
 *   so the authored Row-Level Security is ENFORCED (csadmin, the owner, used to bypass
 *   it). Every connection sets the caller's DB app-role via the libpq startup option
 *   `-c app.role=staff` (PGAPPROLE app-setting, default 'staff'). The RLS policies key on
 *   current_setting('app.role') — 'staff' allows read/insert/update on the work tables and
 *   insert/select on the append-only audit trail, but DELETE is admin-only (restrictive
 *   policy) and the app issues no DELETEs. Azure Flexible Server forbids csadmin from
 *   persisting this as a role-default GUC, hence it is set per-connection here.
 *
 *   A future admin-only destructive path (ADR-0017 retention cascade) must run on a
 *   SEPARATE pool opened with `-c app.role=admin`, gated on a verified CollisionSpike.Admin
 *   token — do NOT widen this pool's role.
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
    // Set the RLS app-role on every backend connection at startup (libpq `-c app.role=…`).
    // PGAPPROLE defaults to 'staff'; the pool is the staff-scoped connection (see header).
    const appRole = (process.env.PGAPPROLE ?? 'staff').replace(/[^a-z]/g, '') || 'staff';
    _pool = new Pool({
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE !== 'disable' ? { rejectUnauthorized: false } : false,
      options: `-c app.role=${appRole}`,
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

/** A `query`-shaped function bound to a single transaction's client. */
export type TxQuery = <R extends Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<R[]>;

/**
 * Run `fn` inside a single transaction on ONE pooled client (BEGIN/COMMIT, ROLLBACK on
 * throw). The callback receives a `query`-shaped function bound to that client so every
 * statement — and any `pg_advisory_xact_lock` it takes — shares the transaction and is
 * released together at COMMIT/ROLLBACK. Used by the intake Case/PO allocator, where the
 * advisory lock must serialise concurrent mints of the same (principal, year) and span
 * both the MAX+1 probe and the INSERT (no duplicate POs under concurrency).
 *
 * Note: the pool already opens each backend with `-c app.role=staff` (see header), so the
 * transaction inherits the RLS app-role; this helper never widens it.
 */
export async function tx<T>(fn: (q: TxQuery) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const q: TxQuery = async (sql, params) => (await client.query(sql, params)).rows as never;
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback failure — surface the original error */
    }
    throw e;
  } finally {
    client.release();
  }
}
