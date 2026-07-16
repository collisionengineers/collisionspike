# Changes — TKT-027: Intermediate intake status beyond 'new'

## Status
Deployed live 2026-07-01 (api 64 / orch 51 functions). Intake `ingested` audit proof pending next email.

## Commits
- (pending commit) — wire `ingested` into email intake pipeline after `caseResolve`.

## Files touched
- `services/data-api/src/features/` — `POST /api/internal/cases/{id}/set-ingested` (new_email → ingested, idempotent, audit).
- `services/orchestration/src/adapters/data-api.ts` — `setIngested()` client method.
- `services/orchestration/src/workflows/intake/setIngested.ts` — new durable activity (step 2.1).
- `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` — call `setIngested` after `caseResolve`, before record-keeping.
- `services/orchestration/src/index.ts` — register `setIngested` activity for esbuild bundle.

## Summary
Email intake now transitions a newly created case from `new_email` to `ingested` ("Logged" in the SPA) as soon as the orchestrator picks it up. `statusEvaluate` still computes the final review state (`needs_review`, `missing_images`, etc.) at the end of the pipeline. No schema or UI label changes — `ingested` was already defined in the domain, queues, funnel, and `StatusBadge`.
