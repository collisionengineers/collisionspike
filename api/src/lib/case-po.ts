/**
 * api/src/lib/case-po.ts — the shared advisory-locked Case/PO mint.
 *
 * ONE implementation of the per-(principal, year) sequence allocation used by BOTH
 * the manual-intake write path (functions/cases.ts createCase) and the automated
 * email-intake resolve (functions/internal.ts internalCasesResolve), plus the new
 * provider API intake channel (functions/provider-intake.ts).
 *
 * The mint MUST run inside a transaction (the `TxQuery` from db.ts `tx(...)`): the
 * `pg_advisory_xact_lock` serialises concurrent mints of the same (principal, year)
 * and is released at COMMIT/ROLLBACK, and it must span BOTH the MAX+1 probe and the
 * INSERT so no two concurrent intakes allocate the same sequence (#11). The caller
 * pushes the returned Case/PO onto its own INSERT column list.
 *
 * The sequence is the digits AFTER the principal+year prefix — the prefix is
 * stripped by LENGTH ($3) so the contiguous year digits are NOT swept into the
 * number (a trailing [0-9]{3,}$ regex would read "CCPY26050" as 26050, not 050).
 * The `~` filter guarantees everything after the prefix is digits, so the cast is
 * safe. The probe is on upper(case_po) (prefix + regex are upper-cased) so a manual
 * lowercase row like 'ccpy26050' is counted — matching the case-insensitive
 * uq_case_case_po index (#82).
 */

import { casePoSequenceRegex, casePoYear, formatCasePo } from '@cs/domain';
import type { TxQuery } from './db.js';

/**
 * Mint the next Case/PO for a (marker, principal, year) under the advisory lock.
 *
 * Each case-type MARKER (ADR-0021: '' standard / 'A.' audit / 'AP.' total-loss audit /
 * 'D.' diminution) runs its OWN independent sequence: the marker is part of the LIKE
 * prefix, the anchored regex (dot escaped), the SUBSTRING offset, AND the advisory-lock
 * key, so "A.PCH26001" and "PCH26123" allocate concurrently without ever colliding.
 * (SQL LIKE treats '.' literally — only % and _ are wildcards — so 'A.QDOS26%' can
 * never sweep in 'AP.QDOS26…'.)
 *
 * @param q         a transaction-bound query fn (from `tx`) — the lock lives on this tx.
 * @param principal the provider principal code (case-insensitive; upper-cased here).
 * @param yy        two-digit year; defaults to the current Case/PO year.
 * @param marker    the case-type marker prefix; '' (default) = the standard sequence.
 * @returns the formatted Case/PO, e.g. "CCPY26051" or "A.PCH26001".
 */
export async function mintCasePo(
  q: TxQuery,
  principal: string,
  yy: string = casePoYear(),
  marker: '' | 'A.' | 'AP.' | 'D.' = '',
): Promise<string> {
  const p = principal.toUpperCase();
  const prefix = `${marker.toUpperCase()}${p}${yy}`; // e.g. "CCPY26" / "A.PCH26"
  // Serialise concurrent mints for this (marker, principal, year); released at COMMIT/ROLLBACK.
  await q('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`casepo:${prefix}`]);
  const seqRows = await q<{ next_seq: string | number }>(
    `SELECT COALESCE(MAX(SUBSTRING(upper(case_po) FROM length($3) + 1)::int), 0) + 1 AS next_seq
       FROM case_
      WHERE upper(case_po) LIKE $1 AND upper(case_po) ~ $2`,
    [`${prefix}%`, casePoSequenceRegex(p, yy, marker), prefix],
  );
  return formatCasePo(p, yy, Number(seqRows[0]?.next_seq ?? 1), marker);
}
