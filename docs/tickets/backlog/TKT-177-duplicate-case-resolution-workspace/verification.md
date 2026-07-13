# Verification — TKT-177: Resolve likely duplicate cases in one workspace

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — explainable multi-factor candidates | Domain fixtures assert the factor list and prove VRM-only input never invokes merge. | Read-only signed-in inspection of representative candidates matches displayed factors to retained sources. | PENDING |
| A2 — complete side-by-side workspace | Component/API tests prove agreeing, conflicting and missing values plus links for pairs and groups. | Deployed workspace shows operator-designated real candidates and opens both full records without losing comparison context. | PENDING |
| A3 — incident-date decision | Fixtures prove confirmed different dates suppress the pair, an audited correction reopens it, and same-date candidates still require review. | Signed-in real examples show confirmed different dates as distinct and same-date candidates awaiting an evidenced decision. | PENDING |
| A4 — auditable distinct decision and material-change reopen | Persistence tests prove symmetric suppression, snapshot/audit retention and reopen on each named material change only. | Capture a genuine approved mark-distinct decision and any later real identity correction; do not edit live case data solely to trigger reopening. | PENDING |
| A5 — lossless merge preview | API/UI tests enumerate every related-record class and fail if any conflict/disposition is absent. | Signed-in preview for an operator-designated real candidate accounts for every field, file, note, link and job before confirmation. | PENDING |
| A6 — safe idempotent canonical merge | Transaction/fault/concurrency/replay tests prove one survivor, no lost bytes, hash-only dedup, redirects and readiness recompute. | A genuine approved merge is reconciled across database, Archive, case UI and audit; response-loss replay stays isolated non-live unless it occurs naturally. | PENDING |
| A7 — bounded safe reversal | Domain tests prove lossless restoration in an eligible lineage and explicit refusal after each irreversible condition. | Capture reversal/refusal only on genuine operator-approved cases; otherwise retain PENDING after isolated non-live proof. | PENDING |
| A8 — complete human-readable audit | Audit-schema/snapshot tests assert actor and every named before/after/disposition field with no raw UI leakage. | Signed-in action log and case history show the correct staff name and plain merge/distinct/reversal actions. | PENDING |
| A9 — authorization and stale-preview protection | API tests cover permitted/forbidden roles, hidden controls, direct-call denial and optimistic concurrency failure. | Signed-in User/Superuser checks prove the policy; stale-preview live proof uses a natural approved concurrency event or remains PENDING. | PENDING |
| A10 — required coverage and deployed reconciliation | All named scenario tests plus existing merge/duplicate regressions pass. | Recorded operator-designated real workflow proves available queue, case, Archive and audit outcomes without seeded data or unrelated changes. | PENDING |

## Pending / gaps
Implementation, regression coverage and naturally occurring signed-in proof are pending.

## How to re-verify
Attach exact isolated test output and operator-designated real deployed evidence. Keep unavailable live classes `PENDING`; do not create mock/seed cases to close them.
