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
