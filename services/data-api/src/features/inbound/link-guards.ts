/**
 * services/data-api/src/features/inbound/link-guards.ts — auto-link safety guards (TKT-101).
 *
 * Live failure (2026-07-06, QDOS refs 46533/1 vs 46671/1): two DIFFERENT matters
 * sniffed the same junk VRM ("AND2"), so the linkReply VRM arm auto-linked the second
 * instruction onto the first's case. The upstream junk-VRM extraction is fixed
 * (engine-v2.10), but a shared/fleet/courtesy-car registration can legitimately recur —
 * so a VRM-only auto-link must additionally be REFUSED whenever the incoming email
 * carries a job/claim reference that CONFLICTS with what the candidate case is known as
 * (its case_ref / case_po / the job-refs of its already-linked emails). That mirrors the
 * ADR-0010 dedup ladder's rung 3 ("reference differs → never merge") on the link seam.
 *
 * Pure + framework-free; the DB read (the candidate's known refs) stays in the caller.
 */

/** Case-insensitive, whitespace-collapsed reference normalisation for comparison. */
export function normalizeRefToken(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * True when a VRM-only link must be refused: the incoming email cites a reference and
 * the candidate case has at least one known reference, but none of them match. When the
 * incoming email cites NO reference, or the case has NO known references, there is
 * nothing to contradict — the (single-hit) VRM link proceeds as before.
 */
export function vrmLinkRefConflict(
  incomingJobref: string | null | undefined,
  caseKnownRefs: readonly (string | null | undefined)[],
): boolean {
  const incoming = normalizeRefToken(incomingJobref);
  if (!incoming) return false;
  const known = caseKnownRefs.map(normalizeRefToken).filter(Boolean);
  if (known.length === 0) return false;
  return !known.includes(incoming);
}
