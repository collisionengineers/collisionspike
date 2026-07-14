# Verification — TKT-185: Audit what actually caused each category override

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — frozen, reconciled cohort | Versioned query/export has immutable IDs, scope, count and duplicate/omission checks. | Authenticated read-only query count and signed-in “Overridden” view reconcile to the frozen cohort. | PENDING |
| A2 — evidence-based provenance class for every row | Ledger validation permits only the named classes and requires one class per cohort ID. | Representative authenticated audit/database evidence proves each populated class; unsupported rows remain unknown. | PENDING |
| A3 — durable citations and honest confidence | Schema/checker requires cited actor/event/version/time fields or an explicit missing/conflict reason. | Signed-in/database spot checks resolve cited event IDs and confirm no inference from display label alone. | PENDING |
| A4 — full semantic review, not sampling | Ledger has expected outcome, rationale and decisive signals for every frozen email; completeness check is 100%. | Every frozen cohort identity is matched to its authorized source message/attachments/thread or an explicit unavailable reason; representative sampling is insufficient. | PENDING |
| A5 — ordered decision lineage | Lineage reconstruction tests order retained events and distinguish category mutation from display/migration state. | Sampled live rows reconcile UI history to audit, suggestion and policy timestamps in order. | PENDING |
| A6 — unknown and staff history stay honest | Review assertions fail if unknowns are imputed or staff events are retyped; no final-correctness shortcut is allowed. | Read-only before/after history proves staff/unknown provenance remains unchanged in deployed data. | PENDING |
| A7 — correct decisions become scoped fixtures/tickets | Fixture manifests reproduce the proven path and each proposed hardening has an atomic dependent ticket with named controls; runtime diffs are absent. | Read-only deployed evidence confirms the mapped originating path; no production correction is performed by this ticket. | PENDING |
| A8 — incorrect decisions become causal remediation tickets | Every incorrect row has a reproduced failure and dependent ticket specifying the required evaluation/controls; runtime/config diffs are absent. | Read-only deployed evidence identifies the responsible writer/version where available; unknowns stay unknown and no synthetic correction is run. | PENDING |
| A9 — human history preserved by audit and follow-ups | Ledger validation and dependent-ticket acceptance preserve original actor/category sequence and require separate future attribution. | Read-only signed-in/database history remains unchanged throughout the audit. | PENDING |
| A10 — attribution gaps become scoped tickets, not invented backfill | Review maps every unresolved instrumentation gap to an atomic ticket and finds no fabricated provenance write. | Live rows lacking proof remain visibly unknown; deployed history/config contains no speculative backfill. | PENDING |
| A11 — 100% final reconciliation and independent check | Aggregate totals exactly equal the cohort and independent reviewer recomputes classes/outcomes/dispositions. | Independent authenticated reconciliation covers every cohort identity/outcome across UI, database/audit and authorized source content. | PENDING |

## Pending / gaps
The cohort has not been frozen or audited, and no correction has been proved or implemented.

## How to re-verify
Attach the frozen cohort, row ledger, regression/evaluation results and authenticated evidence required by every row. Keep `PENDING` until an independent reviewer has challenged all model attributions and reconciled all eleven acceptance lines.
