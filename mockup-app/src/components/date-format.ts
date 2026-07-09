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

/* ----------  Compact received-timestamp (reforge M-D, spec IA §6)  ---------- */

/** Fixed short names — deliberately NOT locale-derived, so grids render (and
    tests assert) identically on every machine. */
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Compact timestamp for GRID cells only (spec IA §6). Never relative:
 *   - same local day as `now`      → `14:32`
 *   - within the last 6 days       → `Mon 09:12`
 *   - older (or future-dated)      → `12/06/25`
 * The full `DD/MM/YYYY HH:mm` form stays in tooltips, aria-labels and case
 * detail (the screens' formatReceived). Empty input → '—'; unparseable input
 * is returned verbatim (never invent a date). EVA date fields are untouched —
 * they keep the DD/MM/YYYY contract helpers above.
 */
export function formatReceivedCompact(iso: string, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (dayDiff === 0) return hm;
  if (dayDiff > 0 && dayDiff <= 6) return `${WEEKDAY_SHORT[d.getDay()]} ${hm}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

/* ----------  Case age from an ISO created timestamp (TKT-072 search rows)  ---------- */

/**
 * Whole CALENDAR days between `iso` and `now` (same local-day arithmetic as
 * formatReceivedCompact; floored at 0 for a clock-skewed "future" timestamp),
 * or null when the input is absent/unparseable. Queue rows get `ageDays`
 * computed server-side (api mappers.ts ageDaysFrom); this is the client-side
 * equivalent for payloads that carry a raw `createdAt` instead — the two agree
 * on "days old" semantics.
 */
export function ageDaysFromIso(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

/**
 * The queue-row age idiom ("12d old", CaseDetail's meta strip; day 0 reads
 * "today" like the peek drawer's compact form). '' when the timestamp is
 * absent/unparseable — the caller renders nothing, never placeholder junk.
 */
export function caseAgeLabel(iso: string | null | undefined, now: Date = new Date()): string {
  const days = ageDaysFromIso(iso, now);
  if (days == null) return '';
  return days === 0 ? 'today' : `${days}d old`;
}
