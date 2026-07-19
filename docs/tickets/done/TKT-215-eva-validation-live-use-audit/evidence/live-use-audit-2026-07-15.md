# Read-only live-use audit — 2026-07-15

## Scope and method

The audit used repository search plus read-only Azure Resource Manager, Function metadata,
application-setting-name and Application Insights queries. No setting values, function keys,
credentials or client content were printed. No endpoint was invoked.

## Repository callers and successor boundary

- Runtime search found no Data API, orchestration or other service call to the validation route.
- The Data API explicitly computed readiness through the shared domain evaluator and its persisted
  status-recompute path.
- Orchestration delegated status evaluation to the Data API. It did not call the validation service.
- The web app projected the same shared domain readiness result for handler-facing screens.
- The validation service contained one route, its private Python implementation, infrastructure,
  service-local contract material and parity tests. Its tests proved only its isolated implementation;
  they did not prove a current caller.
- The current successor boundary is `packages/domain/src/contracts/case-status.ts`, adapted by
  `packages/domain/src/model/case-readiness.ts` and persisted by the Data API status-recompute path.

## Deployed metadata

Read-only commands were scoped to subscription `e6076573-23a5-46a8-acef-7e22d264e5db` and resource
group `rg-collisionspike-dev`.

- Resource `cespkeval-fn-6c6fxd` exists, is enabled, Running, Linux-hosted and HTTPS-only.
- It registers exactly one function and one route: `POST /api/validate-case`.
- The Data API has no application-setting name containing `EVA` or `VALID`.
- Orchestration has `EVASENTRY_FN_URL` only; that setting belongs to the separate submission service.
- The validation app has only host-storage and Application Insights settings. It has no caller or
  upstream configuration.

## Telemetry window

The service is configured to use shared Application Insights `cespike-parser-ai-dev`. Two bounded
queries covered the prior 90 days, which includes the repository's entire deployed-service period:

- Requests matching the service cloud role, host or route: `0`.
- Traces matching the service cloud role: `0`.

The shared sink was active during the window; a control query returned current parser requests.

## Confidence limits

- Zero observed traffic is not a mathematical proof that a future external caller could never be
  configured.
- A caller holding an unrecorded function key would still be technically possible, but repository
  search, both expected caller setting inventories and the full available telemetry window all agree
  that no such caller has acted.
- Scale-to-zero does not explain the absence: a request would still produce request telemetry.
- The live resource remains untouched, so repository removal is reversible without first recreating
  cloud infrastructure.

## Disposition

Remove the repository service and its isolated duplicate contract during PLAN-006. Keep the shared
domain evaluator and Data API recompute path as the canonical implementation. Do not remove or alter
the separate EVA submission service.

Live resource retirement is explicitly deferred to a separately authorized production task. Until
that happens the resource may remain Running but unused. If the repository decision must be rolled
back, restore the service from commit `a57720d9` and reapply the new monorepo path; no live restore is
needed while the existing resource remains.
