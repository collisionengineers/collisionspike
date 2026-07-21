---
id: TKT-298
title: EVA shadow auto-submit behind the extract + finalize starter hardening (PLAN-015 Slice A)
status: now
priority: P1
area: integration
tickets-it-relates-to: [TKT-216, TKT-095, TKT-094, TKT-296]
research-link: docs/tickets/plans/PLAN-015-app-alpha-testing.md
plan: PLAN-015
---

# EVA shadow auto-submit behind the extract (PLAN-015 Slice A)

## Problem

The alpha needs every staff-completed EVA extract to also fire a REST submission to the vendor test
environment (UAT credentials, same base URL — ADR-0005) so the API contract is exercised against
real cases without changing what staff see or do. Today the only REST path is the manual
`finalize-eva-box` HTTP starter, which nobody calls, and which is `authLevel: 'anonymous'` — a
latent exposure the moment `EVA_API_ENABLED` and `BOX_API_ENABLED` are both on.

## Changes

1. New gate `EVA_SHADOW_AUTOSUBMIT_ENABLED` → `gates.evaShadowAutosubmit()` in
   `packages/domain/src/gates.ts` (default off, ADR-0027).
2. New `services/data-api/src/features/cases/eva-shadow-queue.ts` — enqueue `{ caseId }` onto a new
   `eva-shadow-submit` storage queue on the orchestration storage account, using the shared
   `enqueueQueueMessage` transport (service URL via `gates.evidenceBackfillQueueServiceUrl()`'s
   existing fallback).
3. Hook in the `markEvaSubmitted` route (`archive-completion-routes.ts`): after a real
   `ready_for_eva → eva_submitted` transition and only while the gate is on, best-effort enqueue —
   a failure logs a warning and never changes the staff response.
4. New `services/orchestration/src/workflows/archive/eva-shadow-submit.ts` — queue-triggered
   starter (drops unless `evaShadowAutosubmit() && evaApi()`; deterministic instance id
   `eva-shadow-{caseId}`) + `evaShadowSubmitOrchestrator` calling the existing `evaSubmit`
   activity with retry. Deliberately does not run `boxFolderAugment`.
5. Harden `finalize-eva-box-start` from `authLevel: 'anonymous'` to `'function'`.

## Acceptance criteria

- Gate off (unset): a `markEvaSubmitted` transition enqueues nothing; response body unchanged.
- Gate on: exactly one enqueue per real transition; repeat calls (idempotent no-op transitions)
  enqueue nothing; an enqueue failure still returns `{ updated: true }`.
- Consumer: drops with a trace when either gate is off; duplicate queue deliveries for the same
  case do not start a second orchestration while one is running/completed.
- `finalize-eva-box-start` rejects unauthenticated calls (function-key auth).
- Unit tests cover the four behaviours above.

## Artifacts

- [Changes made](./changes.md)
