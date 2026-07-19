# Verification — TKT-215: Audit live use and disposition of the EVA validation service

## Verdict
TESTED (offline)

## Evidence
- [Read-only live-use audit](./evidence/live-use-audit-2026-07-15.md).
- Repository runtime callers: zero; canonical readiness remains in the domain package and Data API.
- Expected caller settings: Data API zero; orchestration has only the separate submission-service URL.
- Deployed resource: enabled and Running, one registered validation route, no caller configuration.
- Shared Application Insights, prior 90 days: zero matching requests and zero matching traces.
- The repository service path is absent from the target function layout and current inventory.
- Shared domain and Data API suites passed 554 and 772 tests respectively after removal.
- Current inventory and strict/broad/binary/image gates pass without the retired repository source.

## Independent verification (2026-07-19)
Independent adversarial re-verification (offline, read-only), not trusting this file's prior evidence — **PASS**:
- Repo-wide search (services/apps/packages/scripts/infrastructure) for `validate-case` / `cespkeval` /
  `eva-validation` / `EVAVALID`: **zero runtime callers**; only metadata/docs/governance references remain.
  `git ls-files` confirms `services/functions/eva-validation` is absent (retained: box-webhook, eva-sentry,
  location-assist, ocr, parser, vehicle-enrichment).
- Submission service distinguished and retained: orchestration `functions-client.ts:22` targets
  `EVASENTRY_FN_URL`, `callEvaSubmit` → route `eva/instruction-inspection` (resource `cespkeva-fn-ufa3ci`);
  the removed validation service was `cespkeval-fn-6c6fxd`, `POST /api/validate-case`.
- Canonical readiness intact in `@cs/domain` and consumed by the Data API:
  `packages/domain/src/contracts/case-status.ts` (`evaluateCaseReadiness`/`statusForReviewCase`) +
  `packages/domain/src/model/case-readiness.ts`; `data-api` `case-support.ts:221`/`:255`
  (`statusForReviewCase(readinessInputForCase(full))`, `canSubmitCaseToEva`) and
  `inbound/internal/service-support.ts:140`.
- Orchestration config references only the submission URL: `infrastructure/config-capture/orch.bicep`
  sets `EVASENTRY_FN_URL` (line 117); no validation-service URL/env anywhere; the Data API has no EVA/VALID setting.
- Removal formally governed: `contracts/runtime-contract.approved-deltas.json` id
  `TKT-215-remove-unused-validation-route` (`POST /api/validate-case` → null, authority TKT-215).
- Suites green with source removed (source-only): `packages/domain/src` 594/594; `services/data-api/src`
  1102/1102. The only failures in a broad run are git-ignored stale `dist/` build artifacts (orphaned
  pre-removal `.js` referencing deleted fixtures) — not tracked source, not a regression.

## Pending / gaps
- Remote CI runs the same offline gates on this close-out PR from a clean checkout; the merge is gated on
  that run being green.
- Live resource retirement is not authorized by PLAN-006 and remains separate production work (owned by
  TKT-252 / PLAN-009); the resource stays enabled and Running as the rollback guard.
- The live App Insights 90-day zero-traffic re-query needs live access and is out of scope for this
  read-only repository verification; an unrecorded future external caller is technically possible until the
  separately approved retirement.

## How to re-verify
Repeat the repository caller/config search and the 90-day requests/traces queries in the attached audit.
Run the shared domain and Data API status tests after source removal, then confirm the final inventory has
no repository service path. Any future live retirement needs its own approval and pre-delete traffic check.
