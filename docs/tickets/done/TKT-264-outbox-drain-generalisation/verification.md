# Verification — TKT-264: Share the outbox monitor lifecycle without flattening lane protocols

## Verdict

PASS (behaviour-preserving, replay-safe) — 2026-07-20.

## Evidence

- **A1 — shared lifecycle removes only proven duplicate code; protocols retained.** The client-side
  singleton lifecycle (readback + race-safe ensure) that the File Request and classification lanes
  literally shared in one file is now `platform/durable-monitor.ts`. Archive-mirror and provider retain
  their pending/complete/defer generation protocols; File Request retains its API-owned atomic `/drain`.
  No orchestrator body was altered.
- **A2 — classification separated and preserved.** `box-classification-monitor.ts` owns the
  `box-classification-monitor-singleton`, `boxClassificationSweepActivity`, interval, and orchestrator;
  the `box-maintenance-monitor-bootstrap` timer and the `maintenance/box-monitors` route still ensure
  and report BOTH monitors (`{ fileRequest, classification }`, `ok` = both running). Test
  `box-maintenance-monitor.test.ts` still drives the classification orchestrator + `ensureBoxClassificationMonitor`
  via `box-maintenance-monitor.js` and passes.
- **A3 — every identifier/rule unchanged.** Function registration names, singleton instance IDs,
  intervals, retry policies, routes, generation-counter/idempotency rules, and remote-write owners are
  verbatim. `check:runtime-contract` byte-identical (191 routes); all 5 archive monitor suites pass.
- **A4 — ADR amended.** `docs/adr/0030-*.md` gains a dated amendment recording shared (client-side)
  versus lane-owned lifecycle, and notes the contract check does not fingerprint Durable identifiers.
- **A5 — delta + build.** Net **+75** lines (shared helper + split module vs collapsed lifecycle);
  orchestration builds.
- **A6 — no live write.**

## Commands

- `npm run build:orch` → exit 0.
- `npm run test --workspace @cs/orchestration` → 50 files, **581** tests pass (monitor suites: 35 pass).
- `npm run check:runtime-contract` → passed, 191 routes unchanged.
- `npm run check:source-size` → PASS.

## Replay-safety argument

The refactor touches only client-side code (HTTP handlers / bootstrap timers). No orchestrator generator
body, yield sequence, retry policy, interval, or reschedule tail changed; no non-determinism
(`Date.now()`, `Math.random`, I/O) entered orchestrator scope; and no Durable identifier was renamed —
so in-flight singleton history replays unchanged. The archive monitor + gate test suites (which exercise
the orchestrator yield sequences) are green.

## Pending / gaps

None for this ticket. Full `node verify-all.mjs` runs at PR time (CI). Sharing the reschedule tail was
intentionally deferred (documented in changes.md) as replay-risk out of proportion to the LOC gain.

## How to re-verify

`npm run build:orch`, `npm run test --workspace @cs/orchestration`, and `npm run check:runtime-contract`
from a clean checkout; confirm the four singleton instance IDs and the `maintenance/box-monitors`
response shape are unchanged.
