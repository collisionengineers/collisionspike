# Operator plan excerpt — § 4 Assistant: additional read-only tools

> From `PLAN-assistant-intake-search-fixes.md` (planning session 2026-07-06). The full plan is
> preserved at
> [TKT-066 evidence](../../TKT-066-assistant-lookup-observability/evidence/operator-note.md).

Add to `TOOLS`/`execTool` (all SELECT-only, handler-language results):

- `get_case_detail` — full case card (status/queue, provider, claimant, VRM, outstanding items,
  inspection address, hold reason).
- `case_activity` — recent audit entries for a case.
- `vrm_twins` — all open cases sharing a VRM (reuses the `openVrmTwins` query).
- `list_queue_cases` — top N oldest cases in a named queue with ages.
- `emails_for_case` — inbound emails linked to a case.
- `aging_exceptions` — the dashboard's overdue list.

Update the system prompt + drawer suggestion chips accordingly.
