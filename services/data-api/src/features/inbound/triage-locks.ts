/**
 * services/data-api/src/features/inbound/triage-locks.ts — rules-engine-v2 Phase 2 (ADR-0019 "mint race") advisory-lock
 * key derivation for the triage ref-gate.
 *
 * The SAME Postgres advisory-lock keys are taken in THREE places so a case-po mint
 * (cases/resolve) and a concurrent read (triage/context, inbound/link-reply) for the SAME
 * Case/PO / job reference / VRM serialise instead of racing (the "cross-mailbox duplicate
 * delivery widens the pre-mint ref-gate race window" failure mode the plan calls out):
 *   - POST /api/internal/triage/context        (internal.ts — reads openCaseMatches)
 *   - POST /api/internal/cases/resolve          (internal.ts — the case-po mint transaction)
 *   - POST /api/internal/inbound/link-reply     (internal.ts — reads reply-link candidates)
 *
 * Key derivation lives in exactly ONE place (this file) so the three call sites can never
 * drift onto different normalizations (e.g. one trims, one doesn't) and silently stop
 * serialising against each other. Mirrors the existing 'casepo:<PRINCIPAL><YY>' advisory-lock
 * precedent (cases.ts / internal.ts's case-po mint: a single JS-built string passed to
 * `pg_advisory_xact_lock(hashtext($1)::bigint)`) — same primitive, a different key namespace.
 *
 * ORDERING: `deriveTriageLockKeys` always returns keys ref -> jobref -> vrm (a FIXED order,
 * regardless of the input object's own key order), so every caller that supplies more than
 * one signal acquires its locks in the SAME global order. Two concurrent requests that each
 * lock, say, {ref, vrm} in a consistent order can never deadlock on each other.
 *
 * PURE key derivation (`deriveTriageLockKeys`) is unit-tested; `acquireTriageLocks` is the
 * thin DB-touching wrapper the three handlers share. It MUST run inside `tx()` — an
 * advisory-XACT lock only makes sense, and only auto-releases, within one transaction
 * (db.ts's `tx` — BEGIN/COMMIT/ROLLBACK on one pooled client).
 */

import type { TxQuery } from '../../platform/db/client.js';

/** The raw signals a triage ref-gate lookup/write may key its serialisation on. All
 *  optional — a caller supplies whichever it has. */
export interface TriageLockKeyInput {
  /** Case/PO, or the case's own stored provider reference (matches case_po OR case_ref). */
  caseref?: string;
  /** Provider job/claim reference (email_classifier.py's `_job_reference` pass-through). */
  jobref?: string;
  /** Vehicle registration mark. */
  vrm?: string;
}

/** Normalize one raw signal to its UPPER-trimmed form, or undefined when blank. */
function normalize(v: string | undefined): string | undefined {
  const t = (v ?? '').trim().toUpperCase();
  return t.length > 0 ? t : undefined;
}

/**
 * Pure: the ordered, deduplicated list of `pg_advisory_xact_lock` string keys for the
 * present signals in `input`. Blank/undefined signals are skipped — supplying none returns
 * an empty array (nothing to lock). Fixed order (ref, jobref, vrm) — see the module doc's
 * ORDERING note. Same inputs -> same output (case/whitespace-insensitive on each signal).
 */
export function deriveTriageLockKeys(input: TriageLockKeyInput): string[] {
  const keys: string[] = [];
  const ref = normalize(input.caseref);
  const jobref = normalize(input.jobref);
  const vrm = normalize(input.vrm);
  if (ref) keys.push(`triage:ref:${ref}`);
  if (jobref) keys.push(`triage:jobref:${jobref}`);
  if (vrm) keys.push(`triage:vrm:${vrm}`);
  return keys;
}

/**
 * Acquire, inside the caller's transaction, one `pg_advisory_xact_lock` per present signal
 * in `input` (fixed ref/jobref/vrm order — see `deriveTriageLockKeys`). Auto-released at
 * COMMIT/ROLLBACK of `q`'s transaction (db.ts's `tx`). A no-op when every signal is blank.
 */
export async function acquireTriageLocks(q: TxQuery, input: TriageLockKeyInput): Promise<void> {
  for (const key of deriveTriageLockKeys(input)) {
    await q('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [key]);
  }
}
