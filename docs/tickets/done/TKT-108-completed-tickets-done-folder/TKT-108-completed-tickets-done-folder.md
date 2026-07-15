---
id: TKT-108
title: Keep completed tickets in the done status folder
status: done
priority: P3
area: docs
tickets-it-relates-to: [TKT-019, TKT-114]
research-link: docs/tickets/README.md
---

# Keep completed tickets in the done status folder

## Outcome

Completed tickets live under `docs/tickets/done/`; active and unresolved tickets remain in their own
status folders. The stable folder model is retained by PLAN-006.

## Acceptance

- Every ticket directory is under exactly one supported status folder.
- Folder status equals frontmatter status.
- `done` means the ticket's acceptance permits its recorded verification evidence.
- Board and index rows are generated from the specs, so a move cannot leave duplicate or misfiled rows.
- Ticket links are rewritten when the lifecycle tool moves a directory.

## Artifacts

- [Changes](./changes.md)
- [Verification](./verification.md)
