/* ============================================================
   Collision Engineers — Case/PO format (DOMAIN LOGIC, M1).

   The Case/PO is the operator's internal work identifier, minted at intake for a
   KNOWN work provider (queue-case-model.md; CONTEXT.md). Format:

       <principalCode><2-digit year><3-digit per-(principal,year) sequence>

   e.g. principal "CCPY", year 2026, sequence 50 -> "CCPY26050".

   This module owns ONLY the deterministic STRING SHAPE. The ACID-safe sequence
   allocation (advisory-lock-serialised MAX+1 over committed case_po rows) lives in
   the Data API's intake persist (api/src/functions/internal.ts) where it has the DB
   connection; keeping the format here makes it a single shared, tested contract that
   the API mints to and any later reader can parse.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O, no live calls.
   ============================================================ */

/** Width of the zero-padded per-(principal,year) sequence (min; overflows past 999). */
export const CASE_PO_SEQ_WIDTH = 3;

/**
 * Format a Case/PO from its parts. `principalCode` is upper-cased + trimmed; `year2`
 * is normalised to its last two digits; `seq` is clamped to a non-negative integer and
 * left-padded to {@link CASE_PO_SEQ_WIDTH}. `marker` is the optional case-type prefix
 * (ADR-0021: '' standard / 'A.' audit / 'AP.' total-loss audit / 'D.' diminution) —
 * each marker runs its OWN per-(marker,principal,year) sequence, so the marker is part
 * of the identity, not decoration. Pure: same inputs -> same output.
 */
export function formatCasePo(
  principalCode: string,
  year2: string | number,
  seq: number,
  marker: '' | 'A.' | 'AP.' | 'D.' = '',
): string {
  const principal = String(principalCode).trim().toUpperCase();
  const yy = String(year2).trim().padStart(2, '0').slice(-2);
  const n = Math.max(0, Math.trunc(Number(seq) || 0));
  return `${marker.toUpperCase()}${principal}${yy}${String(n).padStart(CASE_PO_SEQ_WIDTH, '0')}`;
}

/** The 2-digit year token for a Date (defaults to now). e.g. 2026 -> "26". */
export function casePoYear(d: Date = new Date()): string {
  return String(d.getFullYear() % 100).padStart(2, '0');
}

/**
 * The anchored regex that matches a Case/PO for a given (marker, principal, year)
 * EXACTLY — marker + principal + yy + the sequence digits. Used by the API's MAX+1
 * allocator to scope the sequence probe to this marker+provider+year: the `^` anchor
 * plus the ESCAPED marker dot keep the sequences naturally independent (`^PCH26…`
 * never matches "A.PCH26050", and `^A\.PCH26…` never matches "PCH26050" or
 * "AP.PCH26050"). `principal` is assumed alphanumeric (the work provider principal
 * code is a leading-alpha code), so it is safe in a regex unescaped; callers pass an
 * already-validated code.
 */
export function casePoSequenceRegex(
  principal: string,
  yy: string,
  marker: '' | 'A.' | 'AP.' | 'D.' = '',
): string {
  const markerPattern = marker ? `${marker.toUpperCase().slice(0, -1)}\\.` : '';
  return `^${markerPattern}${principal.toUpperCase()}${yy}[0-9]{${CASE_PO_SEQ_WIDTH},}$`;
}
