# Verification — TKT-069: Assistant answers more questions — case detail, activity, twins, queues, emails, overdue

## Verdict
TESTED (offline)

## Evidence
- `packages/domain/src/capabilities/registry.test.ts` — registry invariants (read/write/humanOnly/
  destructive; no `set_case_status`; agent-visible set is read-only).
- `api/src/functions/assistant.test.ts` — every tool is SELECT-only (write-statement guard).
- `node verify-all.mjs`: domain (950 tests) + API green.

## Pending / gaps
- Built DARK: `ASSISTANT_TOOLSET_V2` defaults **off** — the six tools are inert until flipped.
- **Not deployed.** Live proof (deploy → flip → a six-question read-tool matrix answered from the assistant
  matches the SPA screens) is pending the operator flip in [docs/gated.md](../../../gated.md) (§F).

## How to re-verify
Offline: `npm --prefix packages/domain test`, `npm --prefix api test`. Live (after flip): ask the assistant
one question per tool and cross-check each answer against the corresponding SPA screen / DB row.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

FAILED live on first flip — same root cause as TKT-066 (the six-tool schema emission is what takes the assistant down when the gate is on; all three .positive() limit schemas must be fixed together — AOAI only names the first). SELECT-only invariant + handler labels + drawer chips hold (source/live-render); the per-tool live Q/A matrix runs after the fix + re-flip (probe script recorded in this verdict's How-to-re-verify).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — the 07-09 FAILED is cleared** by the same schema fix + re-flip as TKT-066 (the fix covers all three `.positive()` limit schemas — what took the six-tool set down). The drawer suggestion chips exercising the new tools are in the served bundle ("Which cases are overdue?", "Show the oldest cases in Review", "How many cases are in each queue?", "Find the case for reg"). SELECT-only + handler-language held at source per the 07-09 verdict. Note: with `RETRO_BOX_ARCHIVE_ROOT_IDS` absent, exactly the nine v2 read tools are advertised (archive_lookup correctly self-suppresses — not part of this ticket's six). Remaining: one per-tool authenticated Q/A matrix (six questions, cross-checked vs SPA/DB). Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass note (orchestrator-run, 2026-07-10)
The ai_usage_ledger shows 4 authenticated assistant calls completed 2026-07-09 post-re-flip (see
TKT-066's note). The per-tool six-question Q/A matrix remains.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- Targeted tests passed: 26/26 API assistant tests plus 26/26 domain capability/schema/VRM tests.
- All six tools are present in the deployed-gated source at `assistant.ts:358-469`.
- The SELECT-only invariant covers all six and rejects mutation verbs: `assistant.test.ts:26-31,45-52`.
- The deployed drawer visibly contains prompts for queue counts, overdue cases, oldest Review cases, and
  registration lookup; source at `AssistantDrawer.tsx:56-59`.
- One fresh live tool path was proven:
  - Prompt explicitly requested `list_queue_cases`.
  - The response carried “looked up list queue cases”.
  - It returned QDOS26015/AF12LNU, QDOS26014/J9GGN, QDOS26013/KS65XOZ, AX26010/M21FLN, and
    AX26008/BJ10VJA as 13-day-old Review cases.
  - Every result used the handler label `Review`, not a raw status code.
- The same SPA showed live queue totals of Not ready 435, Review 22, and Held 140.

## Pending / gaps

- Only `list_queue_cases` was exercised live. `get_case_detail`, `case_activity`, `vrm_twins`,
  `emails_for_case`, and `aging_exceptions` remain unread live.
- The returned Review rows were not independently opened on the SPA queue/detail surfaces, so the
  required per-tool SPA/data cross-check is incomplete.
- Failure handling is proven offline through TKT-066 tests but not live.
- Azure PostgreSQL MCP was blocked by the firewall. Per verifier rules, no transient firewall rule was
  created.
- PLAN-001 calls for a distinct read-only database role/connection rather than relying only on SQL
  inspection; this was not demonstrated. Current acceptance tests enforce SELECT syntax on the shared
  executor.

## How to re-verify

- Run a six-question deployed matrix, one explicit prompt per tool, and record the tool provenance shown
  in the drawer.
- Cross-check every answer against the corresponding SPA case, activity, email, twin, queue, or aging
  surface.
- Capture a deployed failure following the TKT-066 retry/warning/audit path.
- Confirm the assistant's database connection uses a genuinely read-only principal, or record the
  PLAN-001 requirement as unresolved.

## Confidence + unread surfaces

High confidence in the source-level SELECT-only dispatch, gates, drawer chips, labels, and live
`list_queue_cases` behavior. Five of six live tool paths, detailed SPA cross-checks, database-principal
enforcement, and live failure telemetry remain unread.
