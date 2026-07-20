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

## Live proof — 2026-07-17 ~05:00Z (post-deploy)
Data-api KQL after the deploy: `internalArchiveHoldingAdoptionCandidates` returns
**200** (x2) and `internalArchiveHoldingRegister` **200** (x1) — the first non-500
responses since 2026-07-16 13:00Z (the 9 x500 in the same window are pre-deploy
residue). The 36/hr `archiveHoldingRecoverUploads` failure signature stops at the
deploy boundary.

## 2026-07-20 — REGRESSED live (read-only diagnosis, not fixed this pass)

Discovered incidentally during the TKT-159 gate audit. `cespk-api-dev` App Insights (last 2h, and
matching over 24h) shows both routes back to **100% failure**:
`internalArchiveHoldingAdoptionCandidates` 33/33 500s, `internalArchiveHoldingRegister` 2/2 500s, with
the exact pre-fix error text (`COALESCE types text and jsonb cannot be matched`,
`inconsistent types deduced for parameter $2`, both at `main.cjs:4199:21`). The fix is still present on
current `main` (commit `3bb70249`).

Deployment-history timing is the likely explanation: `az webapp log deployment list` /
`Microsoft.Web/sites/deployments` show only 3 recorded deploys, all 2026-07-17, all `deployer:
core_tools` (`func azure functionapp publish`) — **10:43:55Z, 11:09:40Z, and 15:29:01Z (active/current)**.
All three postdate the ~05:00Z proof above by 5-10+ hours. None of the three deployment records carry an
author, message, or commit SHA (Flex Consumption exposes no build/package metadata this way, and Kudu
build logs are not persisted on this plan — confirmed via `az webapp log deployment show`). **Best-evidenced
hypothesis, not proven**: the active 15:29-15:30Z publish packaged a build that did not include commit
`3bb70249` — e.g. `func azure functionapp publish` ran from a working tree/branch that predated the fix,
or `npm run build:api` wasn't rerun against fixed source before that specific publish. Reading the package
blob directly to confirm would require Storage Blob Data Reader access not available to this read-only
identity; account-key retrieval was deliberately not attempted to work around that.

**Not fixed in this pass — operator chose "diagnose further, don't redeploy yet."** Recommended next step
for whoever picks this up: rebuild `services/data-api` from current `main` and redeploy via the documented
Windows `func` toolchain, confirm the deployed package actually contains `archive-holding.ts` at commit
`3bb70249` or later, re-run the KQL in "How to re-verify" above, and bank a second live proof here. Verdict
stays `TESTED (offline)` — do not treat the 2026-07-17 live proof above as current; it no longer reflects
the live app.
