# Regression follow-up — 2026-07-11

PR 55 review found that the Box sweep fails open when provider AI permission cannot be read, leaves
opted-out rows eligible to monopolise the newest-first batch, and stamps classification before a
best-effort status recomputation that can be lost permanently.

## Acceptance

- Permission lookup uncertainty never sends an image to the model.
- Opted-out evidence cannot starve eligible evidence behind the batch limit.
- Every successful classification has a durable status-recompute path across crashes and API failures.
- Regression tests cover opt-out, lookup failure, pagination/starvation, and recompute retry.

## Implementation

- The sweep filters provider opt-outs before applying its batch limit and treats a failed policy lookup
  as a no-model decision (`77d0478`).
- Classification stamps increment the case's recompute generation in the same transaction. The sweep
  drains pending generations before checking classification gates and acknowledges one only after a
  row-locked evaluation succeeds (`add9e74`, `0e30f89`, `08dc5d5`).
- Exact-row compare-and-set tests cover stale stamps, provider policy failures and retry recovery.
- Persistent row failures now use durable claim leases, attempt counts, due times and terminal
  dead letters. Transient failures back off from 15 minutes to 24 hours; Box 404/410/413 responses
  and explicit model content-filter results leave the evidence intact but leave the capped work
  page permanently (`c44910d`).
- Claim acquisition uses `FOR UPDATE SKIP LOCKED`, and failure/success reports compare the claim
  token before changing retry state. A regression proves an eligible 26th row is reached behind
  25 terminal failures (`c44910d`).
- The 14-day intake window now applies only to a row's first attempt. Once claimed, a transiently
  failing row keeps its durable due-time/backoff schedule instead of ageing out before a later retry.
- A fixed-id eternal Durable monitor wakes the maintenance path every five minutes and calls the
  service-authenticated classification/status drain. Starting it twice reports the existing singleton
  rather than creating a second schedule (`box-maintenance-monitor.test.ts`,
  `box-maintenance-api.test.ts`).
- `internal-box-classification.test.ts` and `box-classify-sweep.test.ts` cover fail-closed permission
  lookup, opt-out filtering before the page cap, terminal/deferred claim behaviour, the 26th-row
  starvation case and durable status-recompute retry. The repaired API/orchestration suites are green
  offline; monitor startup and a new live upload remain deployment verification work.
