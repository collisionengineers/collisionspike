---
id: TKT-114
title: Enforce the ticket lifecycle transition graph in ticket-move.mjs
status: done
priority: P2
area: docs
tickets-it-relates-to: [TKT-019]
research-link: docs/tickets/done/TKT-114-ticket-move-transition-guard/evidence/operator-note.md
---

# TKT-114 — Enforce the ticket lifecycle transition graph in ticket-move.mjs

## Problem

`scripts/ticket-move.mjs` performs any status→status move: the lifecycle graph in
[docs/tickets/README.md](../../README.md) (§ Lifecycle) is documentation only — neither the mover nor
`check-tickets.mjs` validates a transition. An illegal move such as `backlog → done` (skipping the
`verify` evidence gate) succeeds silently. The `ticket-orchestrate` skill guards transitions in prose,
but that depends on the agent honouring it; the guard should be deterministic in the tool itself.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — distilled decision from the 2026-07-08
  orchestration-layer planning session.
- `scripts/ticket-move.mjs` — `STATUSES` membership is the only validation on the target status; no
  source→target check exists.

## Proposed change

PROPOSED (not built): in `scripts/ticket-move.mjs`, validate the requested single-move transition
against the README lifecycle graph (`backlog→now|next`, `next→now`, `now→verify|done|blocked`,
`verify→done|blocked`, `blocked→now`, `done→now` reopen) and exit non-zero with a clear message on an
illegal move. Add a `--force` flag that bypasses the guard with a loud warning for deliberate
exceptional moves. `--migrate` stays exempt (it realigns folders to frontmatter, not transitions);
`--dry-run` reports the same verdict a real run would.

## Acceptance

- `node scripts/ticket-move.mjs TKT-NNN done` from `backlog` exits non-zero without moving anything,
  naming the illegal transition and the allowed targets.
- Every transition in the README lifecycle graph still succeeds.
- `--force` performs the otherwise-illegal move and prints a warning that the guard was bypassed.
- `--migrate` behaviour is unchanged.
- `--dry-run` on an illegal move reports the refusal without touching files.
- `node scripts/check-tickets.mjs` and the pre-commit hook still pass on the modified script's output.

## Research

Operator note distilled 2026-07-08 (see Evidence). The prose version of the same graph lives in
`.claude/skills/ticket-orchestrate/SKILL.md` (§ Transition guard) — keep the two in step.

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
