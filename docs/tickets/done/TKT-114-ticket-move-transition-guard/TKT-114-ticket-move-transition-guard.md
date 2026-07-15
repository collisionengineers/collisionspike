---
id: TKT-114
title: Enforce ticket lifecycle transitions and regenerate derived views
status: done
priority: P2
area: docs
tickets-it-relates-to: [TKT-019, TKT-108]
research-link: docs/tickets/done/TKT-114-ticket-move-transition-guard/evidence/operator-note.md
---

# Enforce ticket lifecycle transitions and regenerate derived views

## Problem

A documented lifecycle is insufficient if the move tool accepts invalid transitions or leaves links,
board rows, index rows and plan progress out of sync.

## Implemented behavior

`scripts/maintenance/ticket-move.mjs` enforces:

- `backlog → now | next`
- `next → now`
- `now → verify | done | blocked`
- `verify → done | blocked`
- `blocked → now`
- `done → now` for a dated regression follow-up

The command validates the requested move before mutation, moves the whole ticket directory, updates the
spec status, rewrites inbound links inside the ticket system, and invokes deterministic generation for
the board, index and plan progress. Failure rolls the operation back.

## Acceptance

- Illegal transitions exit non-zero and touch no file; `--dry-run` reports the same decision.
- `--force` remains an explicit, noisy exception for the verifier-directed reopen path.
- The move is all-or-nothing across directory, status, inbound ticket links and generated views.
- The validator detects any generation or status drift.

## Artifacts

- [Changes](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
