# Verification — TKT-190: Show complete case details in inbox statuses

## Verdict
PENDING — no historic-row inventory, implementation, offline test result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — resolvable associations show relationship and full current Case/PO | API/component contract tests cover created and linked relationships and assert the exact complete Case/PO and named link. | Signed-in recent and historic created/linked rows reconcile their visible Case/PO to the current case record. | PENDING |
| A2 — Case/PO never clipped and is accessibly named | Visual and accessibility tests use maximum valid Case/PO lengths at desktop, narrow and 200% zoom and assert complete visible/accessibility text bounds. | Signed-in screenshots and accessibility-tree capture show complete Case/PO values at all required display states. | PENDING |
| A3 — current association wins over stale events | API/domain fixtures for merged, reassigned and stale-event rows assert the surviving/current case identifier and Case/PO. | Signed-in examples from the reconciliation inventory open the surviving/current case and show no superseded target. | PENDING |
| A4 — legitimate no-Case/PO state is honest | API/component tests render “Case/PO not assigned”, expose an accessible case-detail action only when the case exists, and reject bare arrows or invented values. | A signed-in legitimate no-Case/PO case shows the accepted wording, opens the existing case safely and reconciles to a null Case/PO in read-only data. | PENDING |
| A5 — unresolved association has no dead link | Orphaned-record fixtures render “Case no longer available” with no anchor/action and appear in the remediation output. | Signed-in inspection of every live unresolved inventory row shows honest non-clickable wording and no failed navigation request. | PENDING |
| A6 — all historic gaps inventoried and repaired safely | Read-only query totals and classified ledger cover both gap classes; repair tests are idempotent and prove no Case/PO extraction from email text. | Pre/post live read-only counts reconcile every row to a classification and repair/residual outcome with no unexplained remainder. | PENDING |
| A7 — exact navigation and return context | Pointer/keyboard route tests assert exact current case ID and browser-Back preservation of page, filters and row context. | Signed-in pointer and keyboard navigation on representative rows opens the exact case; Back restores the captured inbox state. | PENDING |
| A8 — complete regression matrix and no bare arrows | API, component and route test manifest covers all six relationship classes; rendered-copy/DOM checks reject relationship arrows without named destinations. | Signed-in scan of recent and oldest inbox pages finds no bare relationship arrow and records representative evidence for every live class. | PENDING |

## Required artifact
- [Inbox case status reconciliation](./evidence/inbox-case-status-reconciliation.md) — PENDING.
