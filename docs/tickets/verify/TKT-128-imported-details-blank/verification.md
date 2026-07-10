# Verification — TKT-128: "Imported details — from the instruction document or email" renders blank

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING — 2 of 3 lines live-proven. The explicit plain-English empty state renders on three no-parsed-source cases; the dual root cause is recorded and matches the deployed code (internal.ts parserRef fill; deploy 4f2d564a ended 00:45:17Z). The positive-path render awaits the next post-deploy intake whose parsed DOCUMENT carries a provider ref (QDOS26070 was 18min post-deploy but its ref lives only in the SUBJECT, which feeds the dedup candidateRef seam, not parserRef — the honest empty state was design-correct). SCOPED FOLLOW-UP HANDED TO THE INTAKE BATCH: map the subject-sniffed candidateRef into ov_claim_number fill-if-empty at the create seam, so subject-only refs (the operator's original complaint shape) also populate the panel. Offline: apply-parser-fields 10/10 green.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING.**

What shipped, confirmed in repo + built artifacts + registry: the SPA render fix
(`CaseDetail.tsx:2530-2556` — 9 `overviewFacts.*` incl. `Claim no.`, explicit empty state "Nothing
was imported from the instruction document or email yet."), the API data fixes
(`internal.ts:395-398` parserRef → `ov_claim_number` fill-if-empty + `:1146` create-seam
subject-sniffed candidateRef → `ov_claim_number` — the 07-09 scoped follow-up IS now deployed),
served bundle `index-D-JoRJ9H.js` carries the strings and hash-matches the repo dist; the api
republish chain through 2026-07-10T17:55Z carries both waves.

Per acceptance line: (1) mechanism deployed + offline-proven (apply-parser-fields **16/16** incl.
the TKT-128 block), data side banked by W5/W6 (84 live provenance rows at the same seam; case
`186e46c2`'s parser provenance) — but the ref fill writes no provenance row, so only a DB read or an
eyeball proves `ov_claim_number` landed; (2) the empty state was live-proven 2026-07-09 signed-in
and the string is still in the served bundle; (3) the positive-path render on a real parsed case is
**the whole remaining gap**.

Queued SQL (decisive; next data pass):
```sql
SELECT id, case_po, case_ref, ov_claim_number, created_at
  FROM case_
 WHERE COALESCE(ov_claim_number,'') <> '' AND created_at >= '2026-07-09'
 ORDER BY created_at DESC LIMIT 20;  -- expect >=1 row
```
Then the operator opens one returned case → "Imported details" shows `Claim no. <value>` (the only
human step left). Expected absence: pre-fix parsed cases keep the honest empty panel (no backfill in
scope); wider facts (insured/insurer/repairer/policy) out of scope per changes.md Remainders.

Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass result (orchestrator-run, 2026-07-10)
**The positive path landed at volume**: 20 cases with `ov_claim_number` filled since 2026-07-09 —
incl. QCL26008 (226095.TA), QCL26007, A.QDOS26072 (DA/440), and the drain-minted retro cases
(a.pch25537, a.pch26427, …). The data side of acceptance line 1/3 is banked; the ONLY remaining step
is the operator opening one of these cases and seeing "Imported details · Claim no. <value>"
(e.g. QCL26008).
