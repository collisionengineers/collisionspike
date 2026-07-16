# Verification — TKT-183: Match case emails when first names are shortened to initials

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — normalized full-name/initial continuity | Pure tests cover titles, whitespace, punctuation, case and Saira/S/S. variants while snapshots retain raw values. | Signed-in case/email detail shows original values on a naturally occurring operator-designated supported match despite the variant. | PENDING |
| A2 — fixed evidence hierarchy and no name-only attach | Decision-table tests enumerate every rung and fail any auto-attach whose only positive signal is a name. | A naturally occurring operator-designated name-only email remains unattached; an exact-reference counterpart links when available. | PENDING |
| A3 — name variation cannot veto exact evidence | The supplied fixture and case snapshot resolve to one case when the stored name is S Khurshid and the subject says Saira Khurshid. | Operator-approved signed-in replay links the supplied message to the intended active case. | PENDING |
| A4 — strong conflicts and weak names stay safe | Negative tests cover conflicting ref/VRM/provider, surname-only, initial-only, fuzzy and transposed names and assert no wrong attachment. | A naturally occurring operator-designated conflict remains unattached and displays the conflict without overwriting case identity. | PENDING |
| A5 — explicit ambiguity | Multi-candidate tests assert no selected case/new case and verify the candidate/explanation response. | Signed-in inbox shows all candidates for a naturally occurring ambiguous message and “More than one case matches” with no case_id write. | PENDING |
| A6 — canonical attach, evidence and idempotency | API/orchestration tests cover one link/audit, attachment backfill, replay and response-loss retries. | Database, activity and signed-in evidence views show one association and one evidence set after replay. | PENDING |
| A7 — durable staff correction | Override tests reject/correct a match, reprocess unchanged input and assert the decision persists with audit history. | Signed-in correction survives reload/reprocessing and does not silently revert. | PENDING |
| A8 — corpus, regression and deployed paths | Exact/variant/negative fixtures plus correlation, attach and evidence suites all pass with before/after false-positive accounting. | Recorded signed-in proof covers naturally available unique and ambiguous operator-designated messages without production mislinking; unavailable live classes remain PENDING. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the grounded identity/correlation suites and both signed-in scenarios in the matrix, attach one concrete artifact to every row, and retain PENDING until an independent verifier has checked all eight acceptance lines.
