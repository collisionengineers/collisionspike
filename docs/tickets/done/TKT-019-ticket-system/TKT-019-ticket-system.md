---
id: TKT-019
title: Build the Markdown ticket system, generated board and validator
status: done
priority: P2
area: docs
tickets-it-relates-to: [TKT-020, TKT-108, TKT-114, TKT-213]
research-link: docs/tickets/done/TKT-019-ticket-system/TKT-019-ticket-system.md
---

# Build the Markdown ticket system, generated board and validator

## Problem

Work needs one durable authority. Manually maintained status tables and duplicated plan progress drift
from ticket specs and make completed, blocked and active work difficult to distinguish.

## Implemented design

- Ticket specs live under `docs/tickets/<status>/TKT-NNN-slug/`; their frontmatter is canonical.
- Status folders retain `backlog`, `next`, `now`, `verify`, `done` and `blocked`.
- `scripts/maintenance/ticket-generate.mjs` derives `BOARD.md`, this index and every plan's membership/progress.
- `scripts/maintenance/ticket-move.mjs` enforces the lifecycle graph, rewrites inbound ticket-tree links and
  regenerates derived views as one operation.
- `scripts/checks/check-tickets.mjs` validates frontmatter, status, artifacts, links, plan membership, evidence
  manifests and generation parity.
- Binary evidence is resolved through ticket-local manifests and the content-addressed fixture catalog.

## Acceptance

- Every ticket is discoverable from the generated index and appears exactly once on the generated board.
- Folder state and frontmatter state agree.
- Plan membership is bidirectional and progress is computed from member status.
- A spec is always required; `changes.md` is required from `now`; `verification.md` is required in
  `verify` and `done`.
- Illegal lifecycle transitions fail without changing files.
- Generation and validation are deterministic from a clean checkout.

## Artifacts

- [Changes](./changes.md)
- [Verification](./verification.md)
- [Ticket index](../../README.md)
- [Board](../../BOARD.md)
