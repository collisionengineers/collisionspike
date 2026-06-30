/* ============================================================
   date-format — DD/MM/YYYY <-> Date conversion (PURE, no React).

   EVA dates are STORED as `DD/MM/YYYY` strings (or '') — the contract format
   (packages/domain eva-export, the parser schema, and the Postgres CHECK
   constraints all agree). The calendar control (DateField.tsx) works in native
   `Date`, so these two pure helpers bridge the picker and the stored string.

   Kept React-free in its own module so it can be unit-tested in the node test
   env (vitest, the src test files) without pulling in Fluent/DOM — the same split
   as components/readiness.ts vs ReadinessChecklist.tsx.
   ============================================================ */

const DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Parse a `DD/MM/YYYY` string into a LOCAL `Date`, or `null` when the string is
 * empty/blank or not a real calendar date. Round-trips the components back out
 * of the constructed Date so impossible dates (e.g. 31/02/2026) are rejected
 * rather than silently rolled over by the Date constructor.
 */
export function parseDdmmyyyy(s?: string | null): Date | null {
  const m = (s ?? '').trim().match(DDMMYYYY);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  // Reject rolled-over impossible dates (the constructor wraps 31/02 -> 03/03).
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

/**
 * Format a `Date` as `DD/MM/YYYY`, or `''` for null/undefined/invalid. Matches
 * the stored contract format so the value can be persisted verbatim.
 */
export function formatDdmmyyyy(d?: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  return `${dd}/${mm}/${yyyy}`;
}

/** True when `s` is a valid `DD/MM/YYYY` calendar date (empty -> false). */
export function isValidDdmmyyyy(s?: string | null): boolean {
  return parseDdmmyyyy(s) !== null;
}
