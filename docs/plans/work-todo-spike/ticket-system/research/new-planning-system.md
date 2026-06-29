# New planning system research

## Ticket

`../new-planning-system.md` asks for a Markdown-based ticket system with a tracker, possibly a Markdown Kanban board, plus a stale-plan and repo-bloat cleanup process.

This is a repository planning and documentation-system ticket. It should not become a case-handler app feature unless a later ticket explicitly asks for staff-facing issue tracking.

## Current state

The repository already defines several planning surfaces, but none is an atomic ticket system:

- `ROADMAP.md` is the forward worklist and phase checklist. Evidence: `ROADMAP.md:42-48`, `ROADMAP.md:57-64`, `ROADMAP.md:78-85`.
- `CURRENT_STATUS.md` is live state, not future work. Evidence: `ROADMAP.md:42-54`.
- `docs/gated.md` is the operator-blocker registry. Evidence: `ROADMAP.md:42-48`, `docs/README.md:43-46`.
- `docs/TODOS.md` explicitly says there is no flat TODO list and routes work to phase checklists, gated items, review follow-ups, live status, and roadmap. Evidence: `docs/TODOS.md:1-10`.
- `docs/plans/README.md` still documents a phase-folder taxonomy rather than a ticket taxonomy. Evidence: `docs/plans/README.md:22-37`, `docs/plans/README.md:84-121`.
- `docs/plans/work-todo-spike/` is currently an unindexed ticket-source tree containing operator notes, screenshots, and research packs. It is not listed in the documented `docs/plans/README.md` tree at `docs/plans/README.md:39-57`.

The closest proven workflow is the binding-review structure:

- Reviews are dated folders containing `overview.md`, `process.md`, `checklist.md`, per-area `review.md`, and images. Evidence: `docs/reviews/README.md:11-22`.
- The method is to view every image, turn each issue into tracked to-dos, implement, and fill the checklist. Evidence: `docs/reviews/README.md:28-37`.
- Reviews outrank older docs, plans, ADRs, and code. Evidence: `docs/reviews/README.md:3-9`, `CLAUDE.md:134-140`.

That review method is a good model for tickets: every ticket should carry source, research, intended changes, verification, status, and completion notes.

## Why the gap happens

The project has recently moved from a large migration/programme-plan shape to a live remediation backlog. The docs reflect both eras.

The 2026-06-28 hygiene review records the core failure mode: too many truth docs, hand-copied live facts, and no freshness enforcement. Evidence: `docs/_audit/repo-hygiene-2026-06-28/REVIEW.md:13-28`.

That pass improved the root situation by merging forward work into `ROADMAP.md`, centralising live facts into `LIVE_FACTS.json` plus `docs/architecture/live-environment.md`, and adding link/orphan/leakage checks. Evidence: `docs/_audit/repo-hygiene-2026-06-28/REVIEW.md:34-45`, `docs/_audit/repo-hygiene-2026-06-28/REVIEW.md:92-108`.

The remaining problem is granularity. `ROADMAP.md` is a narrative/backlog document, while `docs/plans/work-todo-spike/` has atomic problem stubs. There is no schema, state machine, index, or board to keep those stubs moving from research to implementation to done.

## Files affecting the solution

- `docs/plans/work-todo-spike/ticket-system/new-planning-system.md` — source stub for this ticket.
- `docs/plans/work-todo-spike/**` — current ticket-source notes and new research packs.
- `ROADMAP.md` — should remain the forward worklist and strategic priority view.
- `CURRENT_STATUS.md` — should remain live-state/changelog only.
- `docs/gated.md` — should remain operator-only actions and blockers.
- `docs/reviews/README.md` and `docs/reviews/*/checklist.md` — reusable checklist/sign-off pattern.
- `docs/plans/README.md` — needs to index or explicitly classify the ticket-source area.
- `docs/TODOS.md` — needs reconciliation if a real ticket index replaces the "no flat TODO list" contract.
- `docs/MAINTENANCE.md`, `scripts/check-doc-links.mjs`, and `.github/workflows/docs.yml` — existing freshness enforcement surfaces. Evidence: `docs/MAINTENANCE.md:1-9`, `docs/MAINTENANCE.md:74-119`, `.github/workflows/docs.yml:23-33`.

## Recommended ticket model

Create a Markdown-only ticket system with one file per ticket and one generated or maintained board.

Suggested structure:

```text
docs/tickets/
  README.md
  BOARD.md
  templates/
    ticket.md
  active/
    TKT-0001-short-name.md
  done/
    TKT-0000-example-complete.md
  archived/
    ...
```

If keeping the current location is preferred, use:

```text
docs/plans/work-todo-spike/
  TRACKER.md
  templates/
  <area>/
    <ticket>.md
    research/
      <ticket>.md
```

Recommended frontmatter:

```yaml
---
id: TKT-0001
title: Short plain-English title
status: backlog
priority: P1
type: bug|feature|docs|research|ops
area: inbox|case|evidence|archive|docs|platform
source: docs/plans/work-todo-spike/...
owner: unassigned
created: 2026-06-29
updated: 2026-06-29
blocked_by: []
supersedes: []
links: []
---
```

Recommended body sections:

```md
# Title

## Problem
## Current Evidence
## Proposed Change
## Acceptance Criteria
## Verification
## Risks / Rollback
## Research
## Changes Made And Actions Taken
```

Recommended statuses:

- `backlog`
- `researching`
- `ready`
- `doing`
- `blocked`
- `review`
- `done`
- `archived`

`BOARD.md` can be a Markdown table grouped by status. A generated table is safer than hand-editing once ticket count grows.

## Stale-doc and bloat classification

Every stale/bloat candidate should be classified before moving or deleting:

- `current` — live forward doc, still authoritative.
- `historical` — keep under `docs/HISTORICAL/` or with a clear archive banner.
- `rewrite` — useful domain content but platform/mechanism drift.
- `delete candidate` — duplicate, obsolete, or not linked from a maintained index.
- `ticket source` — operator note or stub that should become one or more atomic tickets.
- `data fixture` — keep near the consuming code or ticket even if the stub is archived.

This avoids losing domain knowledge while still removing planning bloat.

## Implementation path

1. Decide canonical location: `docs/tickets/` is cleaner; `docs/plans/work-todo-spike/` is lower disruption.
2. Add a ticket template and a tracker/board file.
3. Convert each `work-todo-spike` stub into one or more atomic tickets, linking each research pack.
4. Keep `ROADMAP.md` as the priority roll-up, not the place where every implementation detail lives.
5. Keep `docs/gated.md` for operator tasks only.
6. Extend the existing doc checker or add a zero-dependency Node checker for ticket frontmatter, duplicate IDs, missing research links, invalid statuses, and stale `updated` dates.
7. Add `docs/plans/work-todo-spike/` or `docs/tickets/` to the docs index so it is not an orphaned work area.

## Tests and checks

Add or extend a repo-local checker that verifies:

- every ticket has valid frontmatter,
- ticket IDs are unique,
- `status`, `priority`, and `type` use allowed values,
- `source` and `research` links resolve,
- `updated` is not older than a chosen stale threshold while status is active,
- every `done` ticket has a completed `Verification` section,
- no volatile live numbers are copied into tickets outside `LIVE_FACTS.json` / `docs/architecture/live-environment.md`.

The existing doc-freshness tooling should remain part of the gate:

- `node scripts/check-doc-links.mjs`
- `node verify-all.mjs`
- `VERIFY_LIVE=1 node verify-all.mjs` when Azure credentials are available

## Agent findings

Six read-only worker agents were started for this folder. Four returned useful findings before timeout:

- the planning architecture angle confirmed the existing source-of-truth split and recommended a Markdown ticket schema plus status board;
- the docs/tooling angle confirmed the tracker must be linked into the docs graph and validated by a zero-dependency checker;
- the workflow/UI angle confirmed there is no current app route, API route, or domain model for repo tickets, so this should remain docs-only for now;
- the acceptance angle confirmed that every stub should become an atomic ticket or be explicitly archived, with source, acceptance, verification, affected paths, and completion notes.

The remaining two ticket workers did not produce final findings before the context pack was written.
