# Changes — TKT-069: Assistant answers more questions — case detail, activity, twins, queues, emails, overdue

## Status
verify — built DARK behind `ASSISTANT_TOOLSET_V2` (default off); code-complete + tested offline, not yet
deployed. Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 (shared capability registry + six read tools).

## Files touched
- `packages/domain/src/capabilities/registry.ts` + `schemas.ts` + `index.ts` (+ `registry.test.ts`) — the
  shared, env-free capability registry (ADR-0025): descriptors + zod schemas, JSON-schema `parameters`
  derived via `zod-to-json-schema`; invariants (no `set_case_status`; `destructive ⇒ humanOnly`) enforced.
- `api/src/functions/assistant.ts` — six SELECT-only tools via the read adapter: `get_case_detail`,
  `case_activity`, `vrm_twins` (reuses `openVrmTwins`), `list_queue_cases`, `emails_for_case`,
  `aging_exceptions`.

## Summary
The assistant could answer only three questions. Six more SELECT-only tools — sourced from one shared
registry both the assistant and the MCP server consume — cover case detail, activity, VRM twins, queue
listings, a case's emails, and aging exceptions. All gated behind `ASSISTANT_TOOLSET_V2`; the legacy
3-tool path remains for rollback.
