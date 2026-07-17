# Verification — TKT-227: Nightly box-purge fan-out exhausts Postgres connections; nothing purges

## Verdict

TESTED (offline) — code proven by unit tests and builds; live proof pends the next 03:00Z run
after the orchestration deploy.

## Evidence

- `services/orchestration/src/workflows/archive/box-blob-purge.test.ts` — **3 passed** (2026-07-17,
  `npx vitest run src/workflows/archive/box-blob-purge.test.ts` from `services/orchestration`):
  1. schedules `boxPurgeOne` strictly one at a time — every yield is a single activity task,
     never an array yield or `Task.all` wrapper; inputs cover the whole candidate list in order;
  2. a thrown item is salvaged and the loop continues (`{purged: 2, failed: 1, total: 3}`);
  3. empty candidate list returns `{purged: 0, failed: 0, total: 0}`.
- `services/data-api/src/platform/db/client.test.ts` — **9 passed** (2026-07-17,
  `npx vitest run src/platform/db/client.test.ts` from `services/data-api`): `poolMax()`
  defaults absent/garbage (`''`, `'banana'`, `'NaN'`, whitespace, `'ten'`) to 10, accepts 5,
  clamps 0/-3 → 1 and 999 → 20.
- `npm run build:orch` and `npm run build:api` — both clean (2026-07-17).

## Pending / gaps

- **Live proof pending deploy** (orchestration to `cespk-orch-dev` before the next 03:00Z
  timer; each deploy step is separately operator-authorized). Post-deploy probes below.
- `PGPOOL_MAX` is deliberately NOT set anywhere: default 10 keeps live behaviour identical.
  Optional operator action after observing the next purge run: record `SHOW max_connections;`
  on `cespk-pg-dev`, and only if headroom warrants set `PGPOOL_MAX=5` on `cespk-api-dev`
  (bank the SHOW output here).
- App Insights free-tier retention shrinks intra-day — run the KQL the same day as the 03:00Z
  run and bank outputs into this file.

## How to re-verify

Offline:

```
cd services/orchestration && npx vitest run src/workflows/archive/box-blob-purge.test.ts
cd services/data-api && npx vitest run src/platform/db/client.test.ts
```

Post-deploy (next 03:00Z run; bank outputs here):

- Orchestration KQL: `traces | where message has "boxPurgeOne" or message has "box-blob-purge"`
  → started line, per-item events, final `{purged, failed: 0, total}`.
- `exceptions | where outerMessage has "remaining connection slots" | count` → 0.
- Data-api KQL: `requests | where name == "internalBoxMarkPurged" | summarize count() by resultCode`
  → 2xx only.
- DB: `SELECT count(*) FROM evidence WHERE box_file_id IS NOT NULL AND storage_path IS NOT NULL;`
  → ~0 after the run.

## Live proof — 2026-07-17 ~05:00Z (manually triggered timer run, post-deploy)
The fixed orchestrator ran the full backlog sequentially: data-api KQL shows
`internalBoxMarkPurged` **204 x186 with ZERO connection-exhaustion exceptions**
(`exceptions | where outerMessage has "remaining connection slots"` = 0 in-window) —
against last night's 440 failures / 0 purged. The timer was invoked early via the admin
API to prove the fix ahead of the scheduled 03:00Z run; the nightly run should now be
routine. PGPOOL_MAX left unset (default 10) — the fan-out bound alone resolved the
exhaustion; the knob remains available.
