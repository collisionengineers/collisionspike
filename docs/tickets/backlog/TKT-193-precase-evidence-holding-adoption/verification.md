# Verification — TKT-193: Hold pre-case evidence and adopt it when instructions arrive

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — holding identity without a case | Integration tests assert one holding record and zero case/Case-PO/readiness/standard-folder writes for approved pre-case routes. | A naturally arriving operator-designated item shows “Awaiting instructions”, zero new case and no Case/PO allocation. | PENDING |
| A2 — exact facts and safe correlation precedence | Domain fixtures assert retained facts, precedence and abstention for every ambiguous/VRM-only combination. | Authenticated record/source inspection confirms displayed candidates match exact retained message/reference facts. | PENDING |
| A3 — complete source-byte retention and exclusions | Hash manifests for supplied EML/images/docs/PDF extraction match stored fixtures; signature/logo controls stay excluded with audit. | The real operator-designated holding shows downloadable original email and accepted attachments with matching hashes/source links. | PENDING |
| A4 — collision-safe holding storage | Same-name/different-byte, repeated-reference and replay tests prove no overwrite and stable provider identity. | Read-only Archive inspection of real holding items shows stable identities beneath the approved boundary and no invented Case/PO folder. | PENDING |
| A5 — pre-case lifecycle isolation | Query/service/UI tests prove held items are absent from case counts, readiness/export/chaser and existing-case search contracts. | Signed-in dashboard/queues/search/EVA controls show no premature case participation while holding evidence remains visible in context. | PENDING |
| A6 — atomic instruction-time adoption | Integration tests bind/link all manifest items and canonical folder behavior in one operation after exact/confirmed match. | A genuine later instruction produces one case and shows all earlier mail/evidence in canonical views; remain PENDING until that real occurrence. | PENDING |
| A7 — provenance preserved and content-dedup only | Before/after hash/source tests prove original metadata survives and duplicate-content controls collapse only stable-ID/hash twins. | Live reconciliation of a genuine adoption matches source/adopted hashes/times/provider IDs and shows no filename-only loss. | PENDING |
| A8 — idempotent replay and concurrency | Duplicate delivery, response loss, repeated command and concurrent-instruction tests assert one identity/case/evidence/adoption. | Reconcile natural duplicate/resume evidence if it occurs; do not replay live work solely for proof, and otherwise retain PENDING. | PENDING |
| A9 — recoverable partial failure | Fault-injection at every database/provider stage proves recoverable holding, Not Ready behavior, visible failure and complete retry. | Capture a naturally occurring approved failure/retry if available; no live failure is manufactured and the class otherwise remains PENDING. | PENDING |
| A10 — ambiguous matches wait for staff | Candidate tests cover one-to-many and many-to-one conflicts and assert no automatic mint/merge/overwrite. | Signed-in ambiguous fixture shows reasons and requires an explicit handler choice before any ownership change. | PENDING |
| A11 — merge lineage survives | Merge-after-adoption tests transfer active ownership and retain resolvable pre-case/adoption audit. | An operator-approved real merge-after-adoption, when it occurs, shows survivor ownership and intact history; otherwise PENDING. | PENDING |
| A12 — complete plain-language audit | Audit contract tests assert all named fields/events and handler-copy snapshots contain no raw implementation terms. | Signed-in case/inbox history shows correct System/staff name, action, counts and outcome for hold/adopt/retry. | PENDING |
| A13 — narrow documented retention authority | Documentation/link checks and policy tests prove only approved pre-case routes receive the raw-byte exception. | Authenticated behavior shows ordinary query/other controls unchanged and access/RLS enforcement on held bytes. | PENDING |
| A14 — full corpus and deployed hold→adopt proof | All supplied-corpus and named edge/fault scenario suites pass with pinned hashes in isolated non-live environments. | A recorded naturally occurring real workflow reconciles pre-case, instruction, case, Archive, hashes and audits end to end. | PENDING |

## Pending / gaps
The pre-case identity, retention-policy amendment, adoption lifecycle and all proof are not implemented.

## How to re-verify
Run the full supplied corpus and fault/replay suites in isolation, then gather signed-in evidence from naturally occurring operator-designated work. Keep unavailable live classes `PENDING`; do not seed the live app.
