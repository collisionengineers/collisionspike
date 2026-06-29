# Tickets — the atomic work system

> **What this is.** A Markdown-only ticket system: **one ticket = one `.md` file** with YAML
> frontmatter, tracked on a Kanban-style board ([BOARD.md](./BOARD.md)). It is the **granular** layer
> under [ROADMAP.md](../../ROADMAP.md): the ROADMAP is the strategic forward worklist (phases / Now /
> Next / Later); a ticket is a single, self-contained work item with a status, a priority, and a link
> to the research pack that backs it. Live numbers are **never** copied into a ticket — they live only
> in the registry [`LIVE_FACTS.json`](../../LIVE_FACTS.json) / [live-environment.md](../architecture/live-environment.md)
> (per [docs/MAINTENANCE.md](../MAINTENANCE.md)).

This system was created to move the `work-todo-spike` operator notes out of an unindexed drop-zone and
into trackable, atomic units. It follows the same proven shape as the binding-review workflow
([docs/reviews/README.md](../reviews/README.md)): every item carries its source, its research, and its
state.

## Where tickets live

```
docs/tickets/
  README.md   ← this file (the system + index)
  BOARD.md    ← the Kanban tracker (Now / Next / Backlog / Done tables)
  TKT-NNN-<slug>.md   ← one atomic ticket per work item
```

The **research packs and sample data** stay where they are — under
[`docs/plans/work-todo-spike/`](../plans/work-todo-spike/) — and each ticket **links** its pack rather
than absorbing it. That folder is a retained ticket-source + fixture tree (operator notes, screenshots,
`.eml`/PDF/DOC samples other agents consume); do **not** delete it. The map below indexes every
work-todo-spike area to its ticket.

## Ticket file format

Every ticket is a Markdown file beginning with a YAML frontmatter block:

```yaml
---
id: TKT-001
title: Short plain-English title
status: now            # backlog | now | next | done | blocked
priority: P1           # P0 (drop-everything) … P3 (nice-to-have)
area: parsing          # parsing | evidence | box | intake | email | ui | dashboard | ai | platform | docs
tickets-it-relates-to: [TKT-002, TKT-017]   # other ticket ids, or []
research-link: docs/plans/work-todo-spike/<area>/research/<name>.md
---
```

| Field | Meaning |
|---|---|
| `id` | Unique `TKT-NNN` id. Never reused. |
| `title` | One-line plain-English summary (handler-facing, no jargon). |
| `status` | `backlog` (not started) · `now` (in flight this session) · `next` (queued / MVP next) · `done` · `blocked` (needs operator / another ticket). |
| `priority` | `P0`–`P3`. P0 = production-blocking; P3 = cosmetic. |
| `area` | The subsystem the work touches (see the enum above). |
| `tickets-it-relates-to` | Dependency / sibling ids, or `[]`. |
| `research-link` | The repo-relative path to the backing research pack (must resolve). |

Body sections (lightweight — keep it short, the research pack holds the depth):

```md
# Title
## Problem        — what is wrong / wanted (from the operator stub)
## Evidence        — current source paths / live behaviour (from the research pack)
## Proposed change — the intended fix, at a high level
## Acceptance      — how we know it is done
## Research         — link the stub + research pack (+ any sample data)
```

## Lifecycle

```
backlog ──▶ now ──▶ done
   │         ▲
   └─▶ next ─┘        (blocked ⇄ any active state when it needs the operator / another ticket)
```

1. A work item starts as a **research pack** under `docs/plans/work-todo-spike/<area>/research/`
   (fan-out research already done) and an operator **stub** alongside it.
2. It is **distilled into a ticket** here (`backlog`), linking both.
3. When picked up it moves to **`now`** (or `next` if queued for the following slice).
4. On completion it moves to **`done`**; if it stalls on an operator action or a dependency it moves
   to **`blocked`** (record what unblocks it in `tickets-it-relates-to` / the body).
5. [BOARD.md](./BOARD.md) mirrors the current column of every ticket.

**Research packs are advisory, not authoritative.** They were produced by fan-out research agents and
are detailed and broadly accurate, but any live fact (counts, gates, mailbox set, function names) must
be **verified against the registry** ([live-environment.md](../architecture/live-environment.md) /
[`LIVE_FACTS.json`](../../LIVE_FACTS.json)) before you act on it — the packs are point-in-time snapshots.

## Validation

A zero-dependency checker keeps the board honest:

```sh
node scripts/check-tickets.mjs
```

It verifies every ticket has complete frontmatter, that `status` / `priority` use the allowed enums,
that `research-link` resolves to a real file, and that ids are unique. Wire it into your pre-commit
sweep alongside [`scripts/check-doc-links.mjs`](../../scripts/check-doc-links.mjs) (see
[docs/MAINTENANCE.md](../MAINTENANCE.md)).

## Index — work-todo-spike area → ticket

Every `work-todo-spike` area is distilled into at least one ticket; the research pack + operator stub
stay in place and are linked from the ticket.

| Area (`docs/plans/work-todo-spike/…`) | Ticket(s) |
|---|---|
| `document-parsing/` | [TKT-001](./TKT-001-document-parsing.md) |
| `pdf-image-extraction/` | [TKT-002](./TKT-002-pdf-image-extraction.md) |
| `box/box-sync` | [TKT-003](./TKT-003-box-sync.md) |
| `box/case-po-gen` | [TKT-004](./TKT-004-case-po-generation.md) |
| `email-management/actual-management-of-emails` | [TKT-005](./TKT-005-email-actions.md) |
| `email-management/suggested-tags-and-folders` | [TKT-006](./TKT-006-suggested-tags-and-folders.md) |
| `ui-changes/amalgamated-dashboard` | [TKT-007](./TKT-007-amalgamated-dashboard.md) |
| `ui-changes/calendar-box-on-date-fields` | [TKT-008](./TKT-008-calendar-date-fields.md) |
| `ui-changes/clickable-case-and-email` | [TKT-009](./TKT-009-clickable-case-and-email.md) |
| `ui-changes/delete-case` | [TKT-010](./TKT-010-delete-case.md) |
| `ui-changes/casepage` | [TKT-011](./TKT-011-case-page.md) |
| `dashboard-logic/` | [TKT-012](./TKT-012-dashboard-logic.md) |
| `automation-mode/` | [TKT-013](./TKT-013-automation-mode.md) |
| `ui-changes/acme/` | [TKT-014](./TKT-014-acme-placeholder.md) |
| `ai-assistant/` (umbrella + model-selection + backend-data) | [TKT-015](./TKT-015-ai-assistant.md) |
| `ai-assistant/ai-tools/image-analysis` | [TKT-016](./TKT-016-ai-image-analysis.md) |
| `ai-assistant/ai-tools/reg-ocr` | [TKT-017](./TKT-017-ai-reg-ocr.md) |
| `ai-assistant/ai-tools/defer-ai-case-category` | [TKT-018](./TKT-018-ai-case-category.md) |
| `ticket-system/` | [TKT-019](./TKT-019-ticket-system.md) |
| `docs-cleanup/` | [TKT-020](./TKT-020-docs-cleanup.md) |

See [BOARD.md](./BOARD.md) for the live status of each.
