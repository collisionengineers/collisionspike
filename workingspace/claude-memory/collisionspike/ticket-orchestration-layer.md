---
name: ticket-orchestration-layer
description: Ticket delegation runs through the ticket-orchestrate skill (main loop) + ticket-verifier/ticket-implementer agents; the transition guard is now ENFORCED in ticket-move.mjs; verify-sweep PG gap solved via orchestrator data passes
metadata: 
  node_type: memory
  type: project
  originSessionId: 42f6d9f0-d5a5-4ae4-8278-f50d0f4907f5
---

Since 2026-07-08 the repo has a ticket-delegation layer: the `ticket-orchestrate` skill (explicit-invoke,
main-loop orchestrator with area→agent routing + lifecycle transition guard + verify-sweep/work-batch) and
two agents, `ticket-verifier` (read-only verdicts; gates verify→done) and `ticket-implementer` (fallback
for parsing/docs/research-ai). Details live in the repo (AGENTS.md roster, .claude/skills/ticket-orchestrate).

**Why:** the specialists existed but nothing dispatched them per ticket, and implementers were
self-certifying `done` against the truth standard.

**How to apply (updated 2026-07-09 after the PLAN-003 programme, which ran this layer at full scale —
6 implementer waves + 9 verifier tranches, ~49 tickets to done):**
(1) Project agents created mid-session are NOT dispatchable until the next session — agent types
register at startup.
(2) The transition graph is now ENFORCED in `scripts/ticket-move.mjs` (TKT-114, landed 2026-07-09):
illegal moves exit non-zero; `--force` bypasses loudly; `verify→now` (the sweep's reopen path) is
force-only; `--migrate` exempt.
(3) The verify-sweep Postgres gap has a working pattern: verifiers stay read-only and RETURN their DB
checks as "queued for the orchestrator data pass"; the orchestrator then batches all queued SELECTs in
one transient-firewall window (add rule → Entra digital@ + SET ROLE csadmin → run → REMOVE rule) and
transcribes the results. Also: transient rules leak — sweep `az postgres flexible-server firewall-rule
list` for stale `cs*`/`tmp` rules and delete them (17 were found + removed 2026-07-09; only
AllowAzureServices should remain). See [[live-postgres-connect-path]].
(4) Verifiers can drive the deployed SPA read-only through the operator's signed-in Chrome
(chrome-devtools MCP) — this closes most "(a)-class" acceptance lines without a mintable staff token
(az cannot mint an API-audience token, AADSTS65001). Expect operator tab-switch interference; verifiers
should use their own tab + atomic reads.
(5) Gate flips are a verify-sweep trigger, not an end state: the 2026-07-09 ASSISTANT_TOOLSET_V2 flip
took the whole assistant down (AOAI rejected the zod openApi3 boolean exclusiveMinimum tool schemas) and
only the same-hour verifier tranche caught it — flip, then immediately verify, and keep the gate-off
rollback in hand.
