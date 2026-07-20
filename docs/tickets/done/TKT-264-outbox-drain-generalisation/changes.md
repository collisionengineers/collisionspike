# Changes — TKT-264: Share the outbox monitor lifecycle without flattening lane protocols

## Status

Implemented 2026-07-20 on branch `plan008/tkt-264-outbox-monitor-lifecycle`. Behaviour-preserving and
replay-safe; orchestration builds, all 5 monitor suites + the full 581-test suite pass,
`check:runtime-contract` byte-identical.

## Approach — extract the safe (client-side) lifecycle, never touch the orchestrator replay scope

`check:runtime-contract` does NOT fingerprint Durable orchestrator/activity/singleton names, so the
real guard for this change is the monitor/replay test suites plus preserving every identifier
verbatim. The extraction is therefore deliberately confined to the **client side** — status readback
and the race-safe ensure/start that run in HTTP handlers and bootstrap timers — and stays out of the
orchestrator generators entirely.

### Added

- `services/orchestration/src/platform/durable-monitor.ts` — the shared client-side singleton
  lifecycle moved verbatim from `box-maintenance-monitor.ts`: `ALIVE_STATUSES`/`isAlive`,
  `isNotFound`, `MonitorDefinition`, `BoxMonitorStatus`, `readMonitor`, and the race-safe
  `ensureMonitor` (loser re-reads the winner).
- `services/orchestration/src/workflows/archive/box-classification-monitor.ts` — the Box
  image-classification monitor split out of `box-maintenance-monitor.ts`: its singleton id,
  `CLASSIFY_MONITOR` definition, interval env/default, retry policy, `boxClassificationSweepActivity`,
  `boxClassificationMonitorOrchestrator` (body byte-identical), `ensureBoxClassificationMonitor`, and a
  `readBoxClassificationMonitor` reader — all identifiers unchanged.

### Changed

- `box-maintenance-monitor.ts` — now owns ONLY the File Request lane plus the combined control surface.
  It imports the shared lifecycle helper and the classification module, re-exports
  `BOX_CLASSIFY_MONITOR_INSTANCE_ID` / `ensureBoxClassificationMonitor` for back-compat, and
  `readBoxMaintenanceMonitors` / `ensureAll` / the `maintenance/box-monitors` route still compose BOTH
  monitors with the same `ok = fileRequest.running && classification.running` semantics. The
  `boxFileRequestOutboxMonitorOrchestrator` body, the `box-maintenance-monitors` route, and the
  `box-maintenance-monitor-bootstrap` timer are byte-identical.
- `archive-mirror-monitor.ts`, `provider-archive-monitor.ts` — adopt only the behaviour-neutral
  `isAlive` predicate in their existing `ensure*` (replacing the inline
  `['Running','Pending','ContinuedAsNew'].includes(...)`). Their `{ started, status? }` contract, their
  no-race-safe behaviour, their orchestrator bodies, retry, interval, and reschedule tails are
  unchanged.
- `index.ts` — registers `box-classification-monitor.js` explicitly (idempotent; the module also loads
  transitively via `box-maintenance-monitor.js`).
- `docs/adr/0030-outbox-generation-counter-reliability.md` — dated amendment recording exactly which
  lifecycle is shared (client-side) versus lane-owned (orchestrator bodies, retry, interval, reschedule
  tail, data-plane protocol, and the archive-mirror/provider thin ensure contract).

## What is NOT shared (replay-determinism boundary)

Every orchestrator generator body and its exact yield sequence; the per-lane `RetryOptions`
(archive-mirror `15_000,4`; provider `10_000,4`; File Request / classification `15_000,4`; box-folder-
create sub `5_000,3`); interval env/defaults; the reschedule tail (kept inline per lane); the
pending/complete/defer generation trios versus File Request's API-owned atomic `/drain`; and every
Durable orchestrator/activity/sub-orchestrator/singleton/route/timer name. Extracting the 3-line
reschedule tail into a `yield*` helper was deliberately NOT done — it touches all four replay-sensitive
orchestrators for a marginal LOC gain, and the risk/reward is wrong for live in-flight singletons.

## Delta

`git diff --numstat` over `services/`: +201 / −126 (net **+75**). Near-neutral — a shared helper (93) +
the split classification module (72) against the ~120 lines of lifecycle removed from
`box-maintenance-monitor.ts`. No live write.
