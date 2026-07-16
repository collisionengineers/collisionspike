---
name: ticket-orchestrate
description: Orchestrates collisionspike ticket work by dispatching agents — routes a ticket's area to the right specialist (azure-integration-engineer, fluent-spa-designer, box-integration-architect, eva-sentry-integration) or the ticket-implementer fallback, enforces the lifecycle transition graph and the verify→done separation of duties via the read-only ticket-verifier, and runs batch modes (verify-sweep, work-batch). Use for delegated or multi-ticket execution; for working one ticket inline yourself use ticket-implement.
disable-model-invocation: true
---

# Ticket orchestrate

Workflow for **delegated and batch ticket execution**. The orchestrator is **you, in the main
conversation** — the lifecycle state machine and dispatcher. Agents do the work **one dispatch level
down**; they never move ticket status. The authoritative ticket spec is
[docs/tickets/README.md](../../../docs/tickets/README.md); the inline single-ticket procedure this
builds on is [ticket-implement](../ticket-implement/SKILL.md).

Invoke explicitly — for a single ticket you'll work yourself, use `ticket-implement` instead.

## Separation of duties (hard)

| Actor | May do | May never do |
|---|---|---|
| **Orchestrator (you, main loop)** | `ticket-move.mjs`, BOARD "State" cells + README index edits, transcribe verdicts into `verification.md`, run the check scripts, commit | Fabricate a verdict; move `verify→done` without a ticket-verifier verdict or operator evidence |
| **Implementing agent** (specialist or ticket-implementer) | Code, deploy per playbooks, draft `changes.md`, add `evidence/` files | Run `ticket-move.mjs`; write a verdict beyond `PENDING`; dispatch further agents |
| **ticket-verifier** | Read everything (KQL, `SELECT`, `az show/list`, live SPA, Box reads, registry) | Any mutation — it *returns* the verdict block; you transcribe it |

## Step sequence

1. **Intake.** Parse the mode: single `TKT-NNN`, `verify-sweep [filter]`, or `work-batch <ids|count>`.
   For each ticket read the spec (frontmatter + every section), `research-link`,
   `tickets-it-relates-to`, and the `plan:` file if set.
2. **Transition guard.** Before any move, check current→target against the allowed graph (below).
   Illegal move → stop and ask the user. On batch moves, `--dry-run` first.
3. **Route.** Map `area` → dispatch target via the routing table (below). Acceptance spanning areas
   (e.g. API + UI) → split into **sequential** dispatches, API before UI.
4. **Brief.** Build the delegation brief from [templates.md](templates.md). Never dispatch without the
   area hard rules attached; paste the Acceptance section — don't link it.
5. **Dispatch & supervise.** One level only. **Implementers strictly sequential** (one shared dev
   environment: concurrent deploys to `cespk-api-dev`/`cespk-orch-dev` and concurrent `apps/web/src`
   edits collide). **Verifiers up to 3 in parallel** (read-only). On failure/block apply two-strikes —
   reassess or surface to the user; never redispatch an identical brief.
6. **Record.** Implementer returns → confirm `changes.md` is drafted (write it from the agent's report
   if not, per [ticket-implement/templates.md](../ticket-implement/templates.md)). Verifier returns →
   transcribe the verdict block **verbatim** into `verification.md`, adding a line
   `Verified by: ticket-verifier dispatch, <date>`.
7. **Move & sync.** `node scripts/maintenance/ticket-move.mjs TKT-NNN <status>` (never hand-move). Then the two
   gaps the script does **not** cover: the ticket's row in the
   [README index](../../../docs/tickets/README.md) (right section, right path) and the BOARD row's
   **State** cell text.
8. **Gate.** `node scripts/checks/check-tickets.mjs && node scripts/checks/check-doc-links.mjs && node scripts/maintenance/generate-agent-adapters.mjs --check`.
   Fix failures before handing off. Commit only when the user asks.
9. **Report.** Per-ticket outcome table: id, dispatched-to, verdict, transition made, gaps.

## Transition guard (encodes the README lifecycle — `ticket-move.mjs` ENFORCES it since TKT-114)

```
backlog → now | next          next    → now
now     → verify | done | blocked     (now→done only if Acceptance allows offline-only proof)
verify  → done | blocked      blocked → now
done    → now                 (regression reopen only; needs a dated follow-up doc per ticket-implement)
anything else → forbidden — stop and ask the user
```

`scripts/maintenance/ticket-move.mjs` enforces this graph deterministically (TKT-114): an illegal move exits
non-zero naming the transition + the allowed targets; `--migrate` is exempt; `--dry-run` reports the
same verdict without touching files. `--force` bypasses with a loud warning — **`verify → now` (the
verify-sweep's reopen path when live proof fails) is deliberately `--force`-only**; use it exactly
then, never to skip the evidence gate.

**`verify → done` additionally requires** a `VERIFIED-LIVE` verdict in `verification.md` sourced from a
ticket-verifier dispatch or operator-supplied evidence — never from the implementing dispatch's own
claims. `TESTED (offline)` closes a ticket only when its Acceptance explicitly allows offline-only proof.

## Route by `area`

| `area` | Implement dispatch | Hard rules carried in the brief |
|---|---|---|
| `email` `intake` `pipeline` `platform` `integration` `enrichment` `evidence` | **azure-integration-engineer** | [operations](../../../docs/operations/README.md) runbooks + `azure:*` skills; `az`/`func`/`psql` via PowerShell; offline eval fixtures where they exist (`scripts/evaluation/email/`) |
| `ui` `dashboard` | **fluent-spa-designer** | HARD RULE: no engineering language in rendered strings (AGENTS.md); Fluent v9 + CE tokens; build before deploy + hard refresh; a11y follow-up → **accessibility-engineer** if Acceptance requires |
| `box` | **azure-integration-engineer** (code) / **box-integration-architect** (tenant, scopes, webhooks) | the box-scope-guard hook is BLOCKING — stay inside the allowlist |
| `ai` | **azure-integration-engineer** (assistant/API plumbing) / **ticket-implementer** (research/bench) | gates read from the registry |
| `parsing` | **ticket-implementer** | ADR-0018 sibling-first + fixture + re-vendor; fetch the sibling before re-cut (checkout can be stale) |
| `docs` | **ticket-implementer** (or inline if trivial) | [documentation governance](../../../docs/governance/documentation.md); no live-number leakage outside the registry |
| EVA-contract tickets (any area) | **eva-sentry-integration** | the 12-field contract + photo-order rules |
| verification pass (any area) | **ticket-verifier** | always; read-only |

## Batch modes

### verify-sweep
For tickets in `verify` (optionally filtered by priority/area/plan):
1. **Pre-flight:** confirm the live stack is reachable (if the subscription has lapsed every verdict is
   `PENDING` and the sweep is pointless) and Box read ops are inside the scope-guard allowlist.
2. Work in **tranches of ≤6 tickets, ≤3 ticket-verifier dispatches in parallel**.
3. Per verdict: `VERIFIED-LIVE` → transcribe + move to `done` (auto-move is the agreed policy);
   `PENDING` → transcribe, stays in `verify`, note what's missing; `FAILED` → transcribe + move to
   `blocked` (operator/dependency) or reopen to `now` with a dated follow-up doc — **never leave a
   FAILED ticket sitting silently in `verify`**.
4. After each tranche: README index + BOARD State cells, run the gates, report the sweep table.

### work-batch
For implementing several tickets from `now`/`next`: **strictly sequential** — route, brief, dispatch,
record, move each ticket through steps 3–8 before starting the next. After each ticket completes, offer
a ticket-verifier pass (or queue it for the next verify-sweep).

## Additional resources

- Brief + verdict + sweep templates: [templates.md](templates.md)
- Inline single-ticket procedure + artifact templates: [ticket-implement](../ticket-implement/SKILL.md)
- Ticket system spec: [docs/tickets/README.md](../../../docs/tickets/README.md) · board: [BOARD.md](../../../docs/tickets/BOARD.md)
