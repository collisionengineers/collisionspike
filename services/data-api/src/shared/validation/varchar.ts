/**
 * services/data-api/src/shared/validation/varchar.ts — varchar overflow guards for the intake write seams
 * (TKT-073).
 *
 * Live App Insights evidence (2026-06-30 → 2026-07-07): Postgres 22001
 * "value too long for type character varying(16)/(100)" killed case creates on BOTH
 * internal create seams — `case_.vrm` varchar(16) (cases/resolve + retro/create) and
 * `case_.case_ref` varchar(100) (cases/resolve) — and each deterministic failure was
 * retried 3x by the Durable client before the email's case was lost. The rule here:
 * an over-length write must NEVER fail the row.
 *
 *  - A "VRM" longer than the column is JUNK, not data (UK plates are ≤ 8 chars;
 *    varchar(16) is already generous) — it must not be truncated into a correlation
 *    key, so {@link vrmOrEmpty} drops it to '' (the same semantics as "no VRM
 *    sniffed") and the caller warn-traces.
 *  - A reference/free-text column is real data that happens to be long —
 *    {@link clampVarchar} truncates to the column width and reports the clamp so the
 *    caller can warn-trace it (field + original length), never silently.
 *
 * Pure + framework-free so the unit tests pin the exact behaviour.
 */

/** Result of a guarded clamp: the storable value + whether truncation happened. */
export interface ClampResult {
  value: string;
  clamped: boolean;
  /** Original length — only meaningful when `clamped` is true. */
  originalLength: number;
}

/** Truncate `raw` to `max` chars (trimmed). Never throws; null/undefined → ''. */
export function clampVarchar(raw: string | null | undefined, max: number): ClampResult {
  const s = (raw ?? '').trim();
  if (s.length <= max) return { value: s, clamped: false, originalLength: s.length };
  return { value: s.slice(0, max), clamped: true, originalLength: s.length };
}

/** Column width of case_.vrm / inbound_email.body_vrm (050_case.sql / 120_inbound_email.sql). */
export const VRM_COLUMN_MAX = 16;

/**
 * A registration candidate that cannot fit its varchar(16) column is a junk sniff,
 * not a registration — return '' (identical to "no VRM found") rather than truncating
 * garbage into the dedup/link correlation key. Normalises like the intake seams do
 * (trim, uppercase, collapse internal whitespace).
 */
export function vrmOrEmpty(raw: string | null | undefined): { value: string; dropped: boolean } {
  const s = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return { value: '', dropped: false };
  if (s.length > VRM_COLUMN_MAX) return { value: '', dropped: true };
  return { value: s, dropped: false };
}
