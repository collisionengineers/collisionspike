# Changes — TKT-066: Assistant can't find a case by spaced registration + tool failures are invisible

## Status
verify — **GATE FLIPPED LIVE 2026-07-09** (PLAN-003 final wave D1, operator-granted):
`ASSISTANT_TOOLSET_V2=true` on `cespk-api-dev`, readback-proven (registry:
[live-environment.md](../../../operations/live-environment.md)). Code deployed. Remaining
proof: an operator-session spaced-VRM lookup (`YT13 UTV`) through the assistant.
Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 — VRM canonicaliser, assistant tool observability, registry read adapter.

## Files touched
- `packages/domain/src/domain/vrm-canon.ts` (+ `vrm-canon.test.ts`) — the one `canonicalizeVrm` (upper +
  alnum-only); re-pointed the three divergent call-sites: `packages/domain/src/domain/vrm-filter.ts`,
  `services/orchestration/src/platform/image-classify.ts`, and `openVrmTwins` in `services/data-api/src/features/cases/`.
- `services/data-api/src/features/assistant/chat-client.ts` (+ `aoai-chat.test.ts`) — `ChatLogger` + `toolErrors` on the result + one
  retry on a tool throw (Postgres cold-connect).
- `services/data-api/src/features/assistant/chat-routes.ts` (+ `assistant.test.ts`) — `lookup_case` matches on the canonical VRM
  (`regexp_replace(upper(c.vrm),'[^A-Z0-9]','','g')`) so a spaced/lower-case registration resolves; fixed a
  latent `wp.name` → `wp.display_name` (the `work_provider` table has no `name` column).
- `packages/domain/src/gates.ts` — `ASSISTANT_TOOLSET_V2` gate (default off).

## Summary
A spaced registration (`YT13 UTV`) could never match the compacted stored mark, and a tool exception was
swallowed silently. One canonicaliser now normalises VRMs everywhere; the assistant matches on the
canonical form, logs + returns tool failures, and retries once. The registry-driven read adapter is
selected by `ASSISTANT_TOOLSET_V2`, so the earlier 3-tool path stays as instant rollback.

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
