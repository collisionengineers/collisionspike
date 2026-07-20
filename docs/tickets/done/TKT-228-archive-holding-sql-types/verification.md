# Verification — TKT-228: Archive-holding recovery loop 500s on two Postgres type bugs

## Verdict

VERIFIED-LIVE — 2026-07-20T15:58Z redeploy of cespk-api-dev (commit e4cb663b, deployment ID
cb33351f-f0e7-4eee-a584-dcf40f15ad51) resolved the regression; both routes confirmed 200 on the
first organic post-deploy calls (below). Acceptance line 4 is met.

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

**Not fixed in that pass — operator chose "diagnose further, don't redeploy yet."** The 2026-07-17 live
proof above did not reflect the live app at that point; the regression was real and ongoing (855/855 and
67/67 calls failing 100% at the 2026-07-20 baseline, immediately before the redeploy below).

## 2026-07-20T15:58Z — REDEPLOYED and RESOLVED, live-confirmed

As part of a full backlog-deploy sweep (24+ commits across every service, planned and executed by
parallel agents after a clean `node verify-all.mjs` pass — 43/43 checks green), `services/data-api` was
rebuilt from current `main` (`npm run package:deploy`) and redeployed to `cespk-api-dev`:

- Deployed commit: `e4cb663b090116ddc2e9ee1cb25494f04700bf16` (main, tree clean at deploy time).
- Confirmed BEFORE publishing that the bundled `main.cjs` itself carries the fix: 3 occurrences of
  `pg_input_is_valid`, 0 occurrences of the broken `coalesce(duplicate_keys,'{}'::jsonb)` pattern — this
  directly rules out the "stale build" hypothesis raised in the regression entry above.
- Deployment: `func azure functionapp publish cespk-api-dev --javascript` (Flex Consumption requires the
  explicit language flag; the plain command fails client-side detection). Kudu deployment ID
  `cb33351f-f0e7-4eee-a584-dcf40f15ad51`, `start_time 2026-07-20T15:57:27Z` → `end_time
  2026-07-20T15:58:28Z`, `status: 4` (Success), `active: true`.
- Health: state `Running`, availabilityState `Normal`, function count **146** (baseline 144, no drop),
  zero new 5xx/exceptions in the ~5 minutes after deploy.
- **Acceptance line 4, live**: first organic post-deploy calls to both routes —
  `internalArchiveHoldingRegister` at 2026-07-20T16:02:50Z → **200**; `internalArchiveHoldingAdoptionCandidates`
  at 2026-07-20T16:02:56Z → **200**. Post-deploy tally (window strictly after the deploy completed): both
  endpoints 1/1 calls at 200, 0 at 500 — a direct reversal of the pre-deploy 100%-failure baseline.

No further calls had accumulated by the time of this check (the register route runs roughly every ~20min
per the historical rate), but both fired clean on first contact, which is the same signature the original
2026-07-17 live proof used to certify the fix before it regressed. Given the regression's root cause was a
stale build rather than a code defect, and the code is now independently confirmed byte-present in the
deployed bundle before publish, this is treated as resolved rather than requiring a longer soak.

## 2026-07-20T16:1x — sweep-wide PLAN-007 shared credential-path smoke test

This deploy shipped as part of a larger sweep that also included commit `1762b4f9` ("PLAN-007:
`@cs/server-runtime` foundation"), which consolidates every managed-identity/storage-token/HTTP-core path
used by both `cespk-api-dev` and `cespk-orch-dev`. The sweep's own plan required a dedicated post-deploy
smoke test of that shared path before considering the rollout complete. Result, not specific to this
ticket's fix but recorded here since this is where the deploy evidence lives:

- **No regression signal in either service** — zero `AuthenticationError`/`CredentialUnavailableError`/
  401/403/MSI-tagged exceptions or traces since deploy.
- **Positive proof on orchestration**: 8/8 successful managed-identity token mints (`GET /msi/token` via
  IMDS) and 47/47 successful Azure Storage Queue sends, both post-deploy.
- **Blob-specific proof is unproven, not failed**: no organic traffic exercised a blob-touching route in
  either service in the ~90 minutes since deploy. `cespk-api-dev` additionally has a pre-existing
  (unrelated to this deploy) gap in its App Insights dependency auto-collection — it currently emits no
  dependency telemetry at all, which independently blocks certifying its outbound Storage/Postgres/
  Cognitive Services calls from App Insights alone. Filed as its own observability follow-up, not a
  PLAN-007 defect.

Net: the credential-path consolidation itself is healthy on the evidence available; full certification
against the plan's exact wording needs either organic blob traffic to accumulate or a deliberate low-risk
evidence upload/download probe, which was not run (a real mutation, held back pending operator direction).
