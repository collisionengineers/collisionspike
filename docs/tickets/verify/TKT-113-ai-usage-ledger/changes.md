# Changes — TKT-113: AI usage ledger for model capacity controls

## Status
verify — built; schema + writer code-complete + tested offline, not yet applied/deployed. Under
[PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 4.

## Commits
- `6208361` — ai: PLAN-001 Phase 4 — AI usage/capacity ledger.

## Files touched
- `migration/assets/schema/185_ai_usage_ledger.sql` — `ai_usage_ledger` (`usage_day`, `actor`, `surface`,
  `model`, `calls`, `input_tokens`, `output_tokens`; `UNIQUE(usage_day, actor, surface)`) + guarded
  `cespk_app` GRANT; added to the RLS loop in `900_constraints.sql`.
- `api/src/lib/ai-usage.ts` (+ `ai-usage.test.ts`) — `recordAiUsage(...)`, an atomic
  `INSERT … ON CONFLICT (usage_day, actor, surface) DO UPDATE SET calls=calls+1, tokens+=…`; never throws.
- `api/src/functions/assistant.ts` + `api/src/lib/aoai-chat.ts` — real token capture wired into the
  assistant run (usage accumulated via `onUsage`) and recorded best-effort.

## Summary
Adds the capacity ledger the aggregate-token plan needs: an atomic per-day/actor/surface upsert of call +
token counts, RLS-scoped and grant-guarded, wired to capture real usage from the live assistant. Best-effort
(one-call overshoot accepted), never a request-blocking hard ceiling.
