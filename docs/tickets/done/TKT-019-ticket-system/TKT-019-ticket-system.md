---
id: TKT-019
title: Build the Markdown ticket system + board + validator
status: done
priority: P2
area: docs
tickets-it-relates-to: [TKT-020]
research-link: docs/plans/work-todo-spike/ticket-system/research/new-planning-system.md
---

# Build the Markdown ticket system + board + validator

## Problem
There was no atomic ticket system — only a narrative ROADMAP and an unindexed `work-todo-spike` drop-zone
of stubs + research. Build a Markdown ticket system with a tracker (Kanban-style board), a per-ticket
schema, and a freshness/validity checker.

## Evidence
The research pack recommends one file per ticket with YAML frontmatter, a board grouped by status, and a
zero-dependency validator for frontmatter / unique ids / valid enums / resolvable research links — keeping
ROADMAP as the strategic roll-up and `docs/gated.md` for operator-only items.

## Proposed change (delivered)
Created [docs/tickets/](../../README.md): `README.md` (system + format + lifecycle + index), `BOARD.md`
(Now/Next/Backlog/Done tables), one atomic ticket per work-todo-spike item, and
[`scripts/check-tickets.mjs`](../../../../scripts/check-tickets.mjs) (frontmatter present, status/priority enums
valid, research-link resolves, ids unique). Mentioned in [docs/MAINTENANCE.md](../../../MAINTENANCE.md) and
documented in [CLAUDE.md](../../../../CLAUDE.md) (§ Ticket-based planning). Research packs stay in place and are
linked from each ticket.

## Acceptance
Every work-todo-spike item has a ticket on the board; `node scripts/check-tickets.mjs` passes; the system
is reachable from the docs index and CLAUDE.md.

## Research
- Operator stub: [new-planning-system.md](../../../plans/work-todo-spike/ticket-system/new-planning-system.md)
- Research pack: [research/new-planning-system.md](../../../plans/work-todo-spike/ticket-system/research/new-planning-system.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
