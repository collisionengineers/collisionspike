# Changes — TKT-299

## 2026-07-21 — ticket minted (PLAN-015 Slice B)

Ticket created from PLAN-015.

## 2026-07-21 — implementation (ships dark; local-only by design)

- `packages/domain/src/gates.ts` — new `intakePoll()` + `intakePollMailboxes()` accessors
  (`INTAKE_POLL_ENABLED`, `INTAKE_POLL_MAILBOXES`; both default-off/empty).
- `services/orchestration/src/platform/intake-poll-core.ts` — new pure doctrine module
  (sent-items split pattern): honest-empty config parsing, `maxIso`/`effectiveWatermark`
  floor-at-minIntakeDate arithmetic, poisoned-watermark reset, the exact lifecycle-resync queue
  message shape, and the page-size/page-cap constants.
- `services/orchestration/src/workflows/mailbox/intake-poll.ts` — new timer
  (`INTAKE_POLL_CRON`, default every 2 minutes): doubly dark (gate AND its own separate mailbox
  list), strictly sequential per mailbox (the 4-concurrent Graph throttle), pages via the
  existing `listMessageIdsSince`, enqueues to `intake-messages` in the resync shape, persists
  per-mailbox watermarks as JSON blobs in a dedicated `intake-poll-state` container (evidence
  account MI live-shape / `EVIDENCE_BLOB_CONNECTION` Azurite locally), caps pages per tick, and
  never lets one mailbox's failure block the others. Registered in
  `services/orchestration/src/index.ts`. The boundary-message re-read under the `ge` filter is
  deliberate: dedup-safe and the no-progress loop breaker.
- Tests: `intake-poll-core.test.ts` (9) — config parse honest-empty + entry filtering, floor /
  advance / poisoned-reset arithmetic, state-blob round-trip, exact resync message shape,
  paging-constant sanity. All green.
