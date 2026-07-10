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
