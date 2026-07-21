# Changes — TKT-298

## 2026-07-21 — ticket minted (PLAN-015 Slice A)

Ticket created from PLAN-015.

## 2026-07-21 — implementation (ships dark)

- `packages/domain/src/gates.ts` — new `evaShadowAutosubmit()` accessor for
  `EVA_SHADOW_AUTOSUBMIT_ENABLED` (default off, ADR-0027), documented in the new PLAN-015 block.
- `services/data-api/src/features/cases/eva-shadow-queue.ts` — new: `eva-shadow-submit` queue
  producer over the shared `enqueueQueueMessage` MI transport (service URL via
  `gates.evidenceBackfillQueueServiceUrl()`'s fallback), plus the never-throwing
  `maybeEnqueueEvaShadowSubmit` route seam (real transition + gate on → one enqueue; failures
  warn and drop).
- `services/data-api/src/features/cases/archive-completion-routes.ts` — `markEvaSubmitted` calls
  the seam after the transition; the staff response is unchanged in every path.
- `services/orchestration/src/workflows/archive/eva-shadow-submit.ts` — new: queue consumer
  (drops unless `EVA_SHADOW_AUTOSUBMIT_ENABLED` AND `EVA_API_ENABLED`; deterministic
  `eva-shadow-{caseId}` instance dedup admitting Failed/Terminated re-drives) +
  `evaShadowSubmitOrchestrator` = one retry-wrapped call of the existing `evaSubmit` activity.
  Deliberately never runs `boxFolderAugment` (the Case/PO folder is created at intake; the
  augment path mints a UUID-named folder). Registered in `services/orchestration/src/index.ts`.
- `services/orchestration/src/workflows/archive/finalize-eva-box.ts` — starter hardened from
  `authLevel: 'anonymous'` to `'function'`; header records why (the route becomes live-capable
  when the EVA + Box gates are both on). Must be deployed before any `EVA_API_ENABLED` flip
  (runbook Phase 0/6 dependency).
- Tests: `eva-shadow-queue.test.ts` (6) — gate-off/no-transition no-enqueue, single enqueue with
  queue name + payload, transport-failure and missing-config swallow, throwing transport
  contract; `eva-shadow-submit.test.ts` (7) — queue binding, gate drop, deterministic start,
  duplicate skip, Failed re-drive, missing-caseId drop, orchestrator = exactly one `evaSubmit`
  call. All green.
