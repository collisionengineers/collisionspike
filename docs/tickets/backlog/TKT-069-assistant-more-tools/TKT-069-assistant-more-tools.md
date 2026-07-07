---
id: TKT-069
title: Assistant answers more questions — case detail, activity, twins, queues, emails, overdue
status: backlog
priority: P2
area: ai
tickets-it-relates-to: [TKT-060, TKT-066, TKT-072]
research-link: docs/tickets/backlog/TKT-069-assistant-more-tools/evidence/operator-note.md
plan: PLAN-001
---

# Assistant answers more questions — case detail, activity, twins, queues, emails, overdue

## Problem

The assistant can only look up a case summary, count cases by queue, and search inbound emails
(the three tools in `api/src/functions/assistant.ts`). Natural handler questions — "what's
outstanding on CCPY26050?", "what happened on this case recently?", "are there other cases with
this registration?", "what are the oldest cases in Held?", "which emails came in for this
case?", "what's overdue?" — cannot be answered, so the assistant deflects or guesses.

## Evidence

- `evidence/operator-note.md` — plan § 4 (2026-07-06 planning session).
- `api/src/functions/assistant.ts` — current `TOOLS` array: `lookup_case`,
  `count_cases_by_status`, `search_inbound` only.
- Reusable queries already exist: `openVrmTwins` (`GET /api/cases?vrm=`), the dashboard's
  overdue/aging list, the audit read path.

## Proposed change

PROPOSED (not built) — six new **SELECT-only** tools in `TOOLS`/`execTool`, all returning
handler-language results (queue labels, never raw status enums — the AGENTS.md UI-language
rule applies to tool output the model will quote):

- `get_case_detail` — full case card: status/queue, provider, claimant, VRM, outstanding
  items, inspection address, hold reason.
- `case_activity` — recent audit entries for a case.
- `vrm_twins` — all open cases sharing a VRM (reuses the `openVrmTwins` query).
- `list_queue_cases` — top N oldest cases in a named queue with ages.
- `emails_for_case` — inbound emails linked to a case.
- `aging_exceptions` — the dashboard's overdue list.

Update the system prompt to describe the new tools, and refresh the drawer suggestion chips to
showcase them. Depends on TKT-066's normalization + tool-failure logging landing first (shared
`execTool` surface).

## Acceptance

- [ ] Each of the six tools returns correct data for a real case/queue (spot-checked against
      the SPA's own screens).
- [ ] All six are SELECT-only; no INSERT/UPDATE/DELETE anywhere in `execTool` (TKT-060
      invariant).
- [ ] Tool outputs use handler-language queue labels (Held/Review/Not ready), never raw enum
      names.
- [ ] The drawer suggestion chips include prompts that exercise the new tools.
- [ ] Tool failures follow the TKT-066 logging/retry path (no silent `{error}`).

## Verification requirements (proof standard)

1. **Offline tests** — api unit tests per tool (mock rows in → shaped handler-language result
   out), plus one guard test asserting the SQL of every tool matches `^\s*SELECT` (read-only
   invariant pinned).
2. **Gate** — `node verify-all.mjs` green; deploy recorded in [changes.md](./changes.md).
3. **Live probe matrix** — one deployed `POST /api/assistant/chat` question per tool (six
   questions), each answer cross-checked against the corresponding SPA screen or a direct
   Postgres read; capture Q/A pairs in [verification.md](./verification.md).
4. **UI-language audit** — record that no rendered/quoted tool output contains engineering
   vocabulary (status enums, table names).

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(§ 4); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
