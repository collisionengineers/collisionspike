# Changes — TKT-151: Complete vehicle enrichment and warn when a registration cannot be resolved

## Status

Implemented and offline-tested on `codex/tkt-152-canonical-mileage`. Not deployed
or independently live-verified. Ticket status remains backlog until the dispatching
loop performs deployment, the controlled remediation, the final census and the
separate verification verdict.

Exact implementation head before this evidence-only follow-up:
`533003ca9a1587ea8f73705c7cf93660590ceaa8`.

## Runtime path

- Added one authenticated `POST /api/vehicle-data/lookup` route. `{caseId}` reads
  the saved registration and precedence state, calls the canonical service and
  persists the result; `{registration,targetDate?}` provides Manual Intake preview
  through the same owner.
- Moved the enrichment Function client and its settings to the Data API. The
  orchestration activity no longer calls the Function directly and all provider
  modes, including `manual`, now receive record-completion lookup.
- Removed the disabled UI vehicle transport. Manual Intake and Case Detail retries
  use the authenticated Data API route.

## Persistence and precedence

- The writer validates `vehicle-data.v1`, then atomically and idempotently stores
  the lookup run, raw provider snapshots, normalized MOT observations, model
  profiles and mileage result.
- A run id cannot be reassigned to another case. Append-only evidence uses conflict
  guards; current case summary fields point to the latest persisted run.
- Vehicle model and exact numeric mileage fill empty fields only. Existing
  document/staff values are never replaced. Field provenance references the exact
  lookup run and repeated delivery cannot duplicate it.
- Case rows now retain typed lookup/mileage outcome, warning, retryability,
  attempted time and current run id. Blocking/not-found/invalid/temporary/config
  outcomes remain distinct in immutable evidence and have plain staff wording.

## Readiness and operator handling

- Registration cases require both model and mileage before Review. The canonical
  readiness evaluator, API recomputation, queues, checklist and EVA submit guard all
  consume the same rule.
- Case Detail shows a durable “Vehicle details need attention” warning and a
  working “Check again” action. A later successful observed/estimated result clears
  the blocking warning; an unresolved result does not.
- Uncalibrated point estimates remain visible in the lookup evidence but never fill
  the case. Estimate auto-fill is fail-closed until a production-scale chronological
  holdout profile meets its declared coverage and the explicit rollout gate is enabled;
  exact observed MOT readings remain eligible.
- Durable intake retries carry one instance-stable idempotency key. It is bound to
  strict request/response digests and replays the first validated envelope without a
  second lookup run, audit event or field-source row.
- Manual Intake now persists the visible make and model together in EVA's single
  vehicle field. Mileage edits, parser authority, provider intake, persistence and
  readiness share one numeric boundary (digits or correctly grouped thousands only).

## Remediation and verification preparation

- Added a read-only missing-vehicle census SQL artifact.
- Added a dry-run-by-default remediation script. Execution requires explicit
  `--execute` plus a non-empty `--backup-confirmed` reference, processes one case at
  a time through the authenticated route, skips registrations that are not
  defensible inputs, and emits a before/after/residual JSON ledger.
- Added a deployment/rollback/live-proof runbook. No live mutation was performed by
  this implementation branch.
