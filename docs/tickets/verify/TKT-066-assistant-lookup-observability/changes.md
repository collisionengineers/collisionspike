# Changes — TKT-066: Assistant can't find a case by spaced registration + tool failures are invisible

## Status
verify — built DARK behind `ASSISTANT_TOOLSET_V2` (default off); code-complete + tested offline, not yet
deployed. Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 — VRM canonicaliser, assistant tool observability, registry read adapter.

## Files touched
- `packages/domain/src/domain/vrm-canon.ts` (+ `vrm-canon.test.ts`) — the one `canonicalizeVrm` (upper +
  alnum-only); re-pointed the three divergent call-sites: `packages/domain/src/domain/vrm-filter.ts`,
  `orchestration/src/lib/image-classify.ts`, and `openVrmTwins` in `api/src/functions/cases.ts`.
- `api/src/lib/aoai-chat.ts` (+ `aoai-chat.test.ts`) — `ChatLogger` + `toolErrors` on the result + one
  retry on a tool throw (Postgres cold-connect).
- `api/src/functions/assistant.ts` (+ `assistant.test.ts`) — `lookup_case` matches on the canonical VRM
  (`regexp_replace(upper(c.vrm),'[^A-Z0-9]','','g')`) so a spaced/lower-case registration resolves; fixed a
  latent `wp.name` → `wp.display_name` (the `work_provider` table has no `name` column).
- `packages/domain/src/gates.ts` — `ASSISTANT_TOOLSET_V2` gate (default off).

## Summary
A spaced registration (`YT13 UTV`) could never match the compacted stored mark, and a tool exception was
swallowed silently. One canonicaliser now normalises VRMs everywhere; the assistant matches on the
canonical form, logs + returns tool failures, and retries once. The registry-driven read adapter is
selected by `ASSISTANT_TOOLSET_V2`, so the legacy 3-tool path stays as instant rollback.
