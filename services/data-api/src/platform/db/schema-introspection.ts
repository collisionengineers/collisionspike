/**
 * services/data-api/src/platform/db/schema-introspection.ts — cached information_schema.columns existence probe +
 * the pure SQL-assembly helper schema-tolerant writers use.
 *
 * rules-engine-v2 Phase 2 ships code that must deploy safely BEFORE its own DDL delta
 * (database/migrations/2026-07-02-rules-engine-v2-taxonomy.sql) lands live —
 * inbound_email.body_jobref / .conversation_id exist only once that delta is applied.
 * Rather than the try/catch-and-swallow style already used for suggested_category_code
 * (mappers.ts's upsertInboundEmail caller in internal.ts), this probes
 * `information_schema.columns` ONCE per Function-App cold start (cached per table name) and
 * lets a caller build its INSERT/UPDATE around exactly the columns that exist — no failed
 * statement, no swallowed exception, and the column list is computed consistently for any
 * subset of optional columns (including later additions such as TKT-009's Outlook target).
 *
 * `tableColumns` touches the DB (a cached Promise; concurrent first-callers share the one
 * in-flight query; any read failure resolves to an EMPTY set — "column absent" is always the
 * safe default, never a thrown error). `planOptionalColumns` is PURE (no I/O) and does the
 * actual SQL-fragment assembly, so it is unit-testable without a database.
 */

import { query } from './client.js';

const columnCache = new Map<string, Promise<Set<string>>>();

async function loadColumns(table: string): Promise<Set<string>> {
  try {
    const rows = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return new Set(rows.map((r) => r.column_name));
  } catch {
    // A catalog-read failure degrades to "no optional columns present" — never throws, so a
    // caller always has a safe (if pre-DDL-shaped) Set to plan against.
    return new Set();
  }
}

/** The cached column-name set for `table` (public schema). One real query per Function-App
 *  cold start per table; concurrent first callers share the same in-flight probe. */
export function tableColumns(table: string): Promise<Set<string>> {
  let cached = columnCache.get(table);
  if (!cached) {
    cached = loadColumns(table);
    columnCache.set(table, cached);
  }
  return cached;
}

/** True when `column` exists on `table` (public schema), per the cached introspection. */
export async function hasColumn(table: string, column: string): Promise<boolean> {
  const cols = await tableColumns(table);
  return cols.has(column);
}

/** Test-only: drop the cache so a test (or a rare intra-process schema change) can force a
 *  fresh probe. Not used by any production code path. */
export function resetSchemaIntrospectCacheForTests(): void {
  columnCache.clear();
}

/** One candidate optional column + the value a schema-tolerant writer would persist for it,
 *  in the order the caller wants placeholders assigned. */
export interface OptionalColumnCandidate {
  column: string;
  value: unknown;
}

/** The SQL fragments a schema-tolerant upsert needs for its optional columns. */
export interface OptionalColumnPlan {
  /** Present columns, in `candidates` order (a subset — possibly empty). */
  cols: string[];
  /** `$N` placeholder text per present column, numbered from `startIndex`. */
  placeholders: string[];
  /** `col = COALESCE(EXCLUDED.col, "table".col)` per present column, for an
   *  `ON CONFLICT ... DO UPDATE SET` clause. */
  updateSets: string[];
  /** The values to append to the query's params array, in placeholder order. */
  values: unknown[];
}

/**
 * PURE SQL-assembly: filters `candidates` down to the ones present in `presentColumns`,
 * building the INSERT-column-list / VALUES-placeholder / upsert-SET fragments a
 * schema-tolerant writer appends to its base (always-present-column) statement. No I/O —
 * `presentColumns` is supplied by the caller (typically via `tableColumns` above), which
 * keeps this function trivially unit-testable against every present/absent combination.
 *
 * `startIndex` is the first `$N` placeholder number to use — the caller's base statement
 * already occupies `$1..$(startIndex-1)`.
 */
export function planOptionalColumns(
  table: string,
  candidates: readonly OptionalColumnCandidate[],
  presentColumns: ReadonlySet<string>,
  startIndex: number,
): OptionalColumnPlan {
  const cols: string[] = [];
  const placeholders: string[] = [];
  const updateSets: string[] = [];
  const values: unknown[] = [];
  let i = startIndex;
  for (const { column, value } of candidates) {
    if (!presentColumns.has(column)) continue;
    cols.push(column);
    placeholders.push(`$${i}`);
    updateSets.push(`${column} = COALESCE(EXCLUDED.${column}, ${table}.${column})`);
    values.push(value);
    i += 1;
  }
  return { cols, placeholders, updateSets, values };
}
