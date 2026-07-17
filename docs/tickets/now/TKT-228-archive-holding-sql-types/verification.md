# Verification — TKT-228: Archive-holding recovery loop 500s on two Postgres type bugs

## Verdict

TESTED (offline) — SQL shape proven by unit tests and a source-level pin; live proof pends the
data-api deploy.

## Evidence

- `services/data-api/src/features/cases/archive-holding.test.ts` — **35 passed** (2026-07-17,
  `npx vitest run src/features/cases/archive-holding.test.ts` from `services/data-api`; the
  combined run with `archive-holding-schema.test.ts` and `platform/db/client.test.ts` was
  3 files, **46 passed** total). The new
  `TKT-228 — Postgres type-safety regressions` block proves:
  1. module-source pin: zero matches of `coalesce(<prefix>duplicate_keys,'{}'::jsonb)` in
     `archive-holding.ts`; exactly **7** `${NOT_MERGED_INTO_SQL(...)}` usages; the fragment's
     exact text is the validity-guarded CASE (`pg_input_is_valid(col,'jsonb')` before any
     `::jsonb` cast);
  2. `listArchiveHoldingAdoptionCaseIds` emits the guard (`pg_input_is_valid(c.duplicate_keys,
     'jsonb')` + `? 'mergedInto'`) and no broken coalesce;
  3. `registerArchiveHolding`'s intake INSERT carries `$2::text` exactly twice, and the whole
     register transaction's emitted SQL is free of the broken pattern (the Bug-B-masked
     line-157 twin included), with the matching-cases probe guarded.
  All 32 pre-existing archive-holding behavioural tests stayed green (locking order, claims,
  epochs, finalization — contracts unchanged).
- `npm run build:api` — clean (2026-07-17).
- Live-server support for `pg_input_is_valid` is already proven in production by
  `services/data-api/src/shared/mapping/cases.ts:31` (runtime SQL) and the TKT-141 re-retire
  migration run.

## Pending / gaps

- **Live proof pending deploy** of data-api (`cespk-api-dev`; separately operator-authorized).
  The unit harness mocks `tx`, so it pins emitted SQL text, not server execution — plan-time
  validity on the live server is confirmed by the post-deploy probes below.
- App Insights free-tier retention shrinks intra-day — run the KQL the same day as the deploy
  and bank outputs into this file.

## How to re-verify

Offline:

```
cd services/data-api && npx vitest run src/features/cases/archive-holding.test.ts
```

Post-deploy (bank outputs here):

- KQL: `requests | where name in ("internalArchiveHoldingAdoptionCandidates",
  "internalArchiveHoldingRegister") | summarize count() by name, resultCode` → zero 500s; the
  `COALESCE types text and jsonb cannot be matched` / `inconsistent types deduced for
  parameter $2` failure signatures absent from `exceptions`.
- The ~36/hr failure rate (running since 2026-07-16 13:00Z) drops to zero after deploy.
- DB: previously stuck holding epochs drain (adoptable folders with all files uploaded get
  discovered and adopted on the next monitor pass).
