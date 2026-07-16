# Changes — TKT-069: Assistant answers more questions — case detail, activity, twins, queues, emails, overdue

## Status
verify — **GATE FLIPPED LIVE 2026-07-09** (PLAN-003 final wave D1, operator-granted):
`ASSISTANT_TOOLSET_V2=true` on `cespk-api-dev`, readback-proven — the six read tools are
active (SELECT-only dispatch; invariant pinned by `assistant.test.ts`). Remaining proof:
operator-session assistant answers over the new tools. Registry:
[live-environment.md](../../../operations/live-environment.md).
Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 (shared capability registry + six read tools).

## Files touched
- `packages/domain/src/capabilities/registry.ts` + `schemas.ts` + `index.ts` (+ `registry.test.ts`) — the
  shared, env-free capability registry (ADR-0025): descriptors + zod schemas, JSON-schema `parameters`
  derived via `zod-to-json-schema`; invariants (no `set_case_status`; `destructive ⇒ humanOnly`) enforced.
- `services/data-api/src/features/assistant/chat-routes.ts` — six SELECT-only tools via the read adapter: `get_case_detail`,
  `case_activity`, `vrm_twins` (reuses `openVrmTwins`), `list_queue_cases`, `emails_for_case`,
  `aging_exceptions`.

## Summary
The assistant could answer only three questions. Six more SELECT-only tools — sourced from one shared
registry both the assistant and the MCP server consume — cover case detail, activity, VRM twins, queue
listings, a case's emails, and aging exceptions. All gated behind `ASSISTANT_TOOLSET_V2`; the earlier
3-tool path remains for rollback.

## Incident note — 2026-07-09 ASSISTANT_TOOLSET_V2 flip broke assistant chat (fixed, final wave D2)

The D1 `ASSISTANT_TOOLSET_V2=true` flip took the whole assistant surface down: every
`POST /api/assistant/chat` 400d at AOAI with `Invalid schema for function 'case_activity':
True is not of type 'number'` (`invalid_function_parameters`). Root cause:
`packages/domain/src/capabilities/schemas.ts` `toJsonSchema` targets OpenAPI-3.0, whose emission
for zod `.positive()` is a BOOLEAN `exclusiveMinimum: true` beside `minimum: 0` — AOAI validates
tool parameters as draft-2020-12 (numeric exclusiveMinimum) and rejects the WHOLE tools array
(all three `.positive()` limit fields: CaseRefLimitParams / QueueParams / LimitParams; AOAI only
names the first). The orchestrator mitigated live by flipping the gate back to false.

Fix (D2 batch): the three `limit` fields now use `.min(1)` (plain numeric `minimum`, valid in
every draft), and `toJsonSchema` gained a recursive `normalizeExclusiveBounds` post-pass that
rewrites any OpenAPI-3.0 boolean exclusive bound into the numeric draft-2020-12 form — no zod
refinement can re-emit the poison shape. Pinned by `packages/domain/src/capabilities/schemas.test.ts`:
no boolean exclusiveMinimum/exclusiveMaximum anywhere in ANY capability's parameters; the three
named tools' limit shape (integer, minimum 1, maximum 50); the normaliser's gt/lt conversion.
Domain suite 49 files / 1070 tests green. `ASSISTANT_TOOLSET_V2` re-flipped to true after the D2
api redeploy (readback + smoke recorded in LIVE_FACTS verifiedBy).
