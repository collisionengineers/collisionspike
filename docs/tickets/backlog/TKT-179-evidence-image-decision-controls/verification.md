# Verification — TKT-179: Make photo decisions explicit

## Verdict
PENDING — no implementation, migration inventory, offline test result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — one three-choice Photo use control | Rendered component tests enumerate the three exact choices and a source/rendered-copy check proves the two old independent controls are absent from evidence surfaces. | Signed-in evidence screenshots on desktop and narrow layouts show one control and all three choices on an editable image. | PENDING |
| A2 — unambiguous persisted mapping | Domain transition table tests assert all three stored pairs and reject accepted-and-excluded together on create/update. | On an operator-designated case, save each choice, reload, and reconcile the visible value to the read-only stored accepted/excluded fields. | PENDING |
| A3 — exclusion reason and audit remain truthful | Component/domain tests cover required reason, transition away, visible summary and append-only audit for every exclusion transition. | Save “Do not use” with a reason, change away, reload, and capture the signed-in history plus stored current state without losing the prior audit event. | PENDING |
| A4 — registration visibility independent; Overview one-way implication | Domain and component tests prove Overview sets visibility atomically, visibility alone never changes role, and other roles can retain visibility. | Signed in, exercise Overview→visible and visible-on-another-role on a designated image; reload and reconcile both stored values and the audit event. | PENDING |
| A5 — invalid Overview and failed/concurrent saves handled | API/domain tests reject Overview+not-visible; mocked failure and concurrency tests prove rollback to confirmed state and retryable plain-language feedback. | In a signed-in session, force a request failure and a stale concurrent update, then show that no false state remains after reload and the handler can retry. | PENDING |
| A6 — readiness, ordering and export consume canonical choice | Readiness, ordering and EVA-export suites prove included, excluded and undecided behaviour and contain no direct divergent UI re-derivation. | On a designated live case, compare the saved choices with readiness and a non-sending export preview/read-only export payload; do not submit to EVA solely for verification. | PENDING |
| A7 — historic states preserved; impossible states reported | Read-only inventory plus migration/reload tests cover every valid legacy pair and demonstrate that impossible pairs enter a remediation report without coercion. | Reconcile signed-in examples of each existing valid state after deployment and publish the live residual list for every impossible record. | PENDING |
| A8 — accessible and responsive | Keyboard, focus, accessible-name, validation association, narrow-layout and 200% zoom component/visual tests pass. | Signed-in keyboard-only and accessibility-tree proof at narrow width and 200% zoom shows every choice and reason action reachable and named. | PENDING |

## Required artifact
- [Photo decision state proof](./evidence/photo-decision-state-proof.md) — PENDING.
