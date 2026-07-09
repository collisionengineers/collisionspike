# Verification — TKT-097: Cancellation email misclassified as a case query

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
- Live `/classify-email` on the sample returns `cancellation` (not `query_existing_work`).
- Eval-corpus regression pin added.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. The Oakwood sample (rebuilt from the raw .eml) classifies cancellation/cancellation_notice live at 0.8 with "not wish to proceed" winning over the exact competing signals that caused the miss; the TKT-031 query control still returns query_existing_work (no regression into cancellation); pin tkt097-oakwood-cancellation green, cancellation recall 13/13 pinned by --check; the +2 phrases present in the deployed vendored rules. Non-item: retro re-route of the original row is a staff action (the acting rung handles the next arrival).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
