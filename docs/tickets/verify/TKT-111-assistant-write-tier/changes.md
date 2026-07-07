# Changes — TKT-111: Assistant write tier with human confirmation

## Status
verify — built DARK behind `ASSISTANT_WRITE_TIER_ENABLED` (default off); code-complete + tested offline,
not yet deployed. Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 2; ADR-0024.

## Commits
- `754c38a` — ai: PLAN-001 Phase 2 — propose→confirm→execute write tier + optimistic concurrency.

## Files touched
- `packages/domain/src/dto/index.ts` — `ProposedAction` (capability, title, method, path, body, params);
  `AssistantReply.proposals?`.
- `packages/domain/src/capabilities/registry.ts` + `schemas.ts` — write capabilities (`set_on_hold`,
  `log_chase`, `set_triage_state`, `reclassify_inbound`, `save_inspection_decision`, `edit_case_fields`,
  `create_case`; `merge_cases` is `destructive+humanOnly`, never proposable).
- `api/src/functions/assistant.ts` — a single `propose_action` tool (validates params against the zod
  schema, returns a `ProposedAction`; performs NO write) + `buildExecutor`.
- `api/src/lib/concurrency.ts` (+ `concurrency.test.ts`) — `versionToken`/`ifMatch`/`staleVersion`;
  applied to `setOnHold` + `caseById` (ETag) in `api/src/functions/cases.ts`.
- `mockup-app/src/components/ConfirmActionCard.tsx` — independently re-fetches the target, renders the
  structured route+params diff, POSTs with `If-Match`, 409s on stale. Wired in `AssistantDrawer.tsx`;
  `data/index.ts` + `rest-client.ts` (`executeProposal`, `caseWithVersion`).
- `packages/domain/src/gates.ts` — `ASSISTANT_WRITE_TIER_ENABLED` gate (default off).

## Summary
The in-app assistant gains writes without the model ever issuing one: it proposes a registry-validated
action, the SPA re-fetches state and shows a structured diff, and only a human confirm POSTs to the
existing staff-authorised route with an `If-Match` precondition (409 on concurrent edit). Authorisation
stays at the Data API. `set_case_status` and AI byte-upload are deliberately excluded.
