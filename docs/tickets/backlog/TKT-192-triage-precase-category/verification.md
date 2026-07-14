# Verification — TKT-192: Keep triage requests outside the case queue until instructions arrive

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — explicit Triage classification | Every supplied request fixture resolves to the Triage category with negatives for normal instruction/query/images mail. | Signed-in inbox shows “Triage” for safely probed samples and no wrong category. | PENDING |
| A2 — no case or Case/PO before instructions | Domain/API/orchestration guards assert no case/EVA/folder/queue/Case-PO side effect and UI tests show the stated next action. | Postgres, audit and signed-in queues show a naturally arriving operator-designated triage item but no case or Case/PO. | PENDING |
| A3 — canonical TKT-193 handoff envelope | Contract tests emit every named original/normalized identity fact and one classification/policy version. | Read-only correlation shows the real triage message produced the expected single handoff envelope. | PENDING |
| A4 — one holding operation, no parallel store | Integration tests assert one accepted/reused/failed TKT-193 operation and prohibit alternative attachment/folder writes in this route. | Telemetry/audit for the real arrival shows one TKT-193 handoff and no duplicate storage path. | PENDING |
| A5 — reply remains Triage without a case | Classifier/thread tests recognise supplied CE replies, support Answered and prohibit case creation. | A naturally occurring reply appears in the same Triage conversation and leaves case count unchanged. | PENDING |
| A6 — later instruction delegates adoption | Contract tests pass matching facts to standard intake/TKT-193 and prove this route does not mint early or duplicate adoption. | Read-only live evidence is gathered when a real later instruction occurs; adoption itself is verified under TKT-193. | PENDING |
| A7 — ambiguity/conflict remains outside cases | Decision-table tests cover multiple, conflicting and weak inputs and assert no guessed link/allocation. | A naturally occurring ambiguous item shows “Details need checking” and no case/Case-PO write, or remains PENDING. | PENDING |
| A8 — handled state respects retention policy | UI/domain tests prove Handled is only a Triage workflow state and delegates search/retention/deletion to TKT-193. | Signed-in handled-state proof confirms no conversion into case work and no contradiction with the recorded retention policy. | PENDING |
| A9 — idempotent classification/routing | Duplicate/forward/retry tests assert one current Triage decision and one holding-operation identity with zero case allocation. | Natural duplicate/retry evidence is reconciled if available; no live replay is manufactured solely for proof. | PENDING |
| A10 — complete corpus and deployed routing | Classifier, policy, handoff-contract, API and SPA suites pass using the supplied corpus. | Recorded signed-in proof covers a naturally arriving Triage item with no Case/PO; storage/adoption proof is linked from TKT-193. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the request/reply, no-case and TKT-193 handoff suites; gather signed-in evidence only from real operator-designated work and retain unavailable natural-occurrence rows as PENDING.
