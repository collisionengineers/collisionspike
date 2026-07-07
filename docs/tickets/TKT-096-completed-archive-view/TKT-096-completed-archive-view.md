---
id: TKT-096
title: Completed/Archive view + dashboard drill-through + terminal-scope search fold-in
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-094, TKT-072]
research-link: docs/tickets/TKT-096-completed-archive-view/evidence/operator-note.md
---

# Completed/Archive view + dashboard drill-through + terminal-scope search fold-in

> Phase D of the case-done-lifecycle cluster. Depends on **TKT-094** (`done` status) + **TKT-095**
> (detectors) for cases to reach `eva_submitted`/`done`. The full plan lives in
> [TKT-094/evidence/PLAN-case-done-lifecycle.md](../TKT-094-case-done-status-model/evidence/PLAN-case-done-lifecycle.md).

## Problem

Terminal cases map to **no queue by design** (ADR-0008 "tool boundary ends at EVA handoff"), so completed
cases surface only as dashboard *counts with no drill-through* and are not reachable by search. The top-bar
search box is decorative, and global search (TKT-072) doesn't say whether completed cases are in scope.

## Evidence

- `evidence/operator-note.md` — Phase D of the plan (Completed area, not a 4th work-queue) + the
  search-scope decision.

## Proposed change

PROPOSED (not built) — **Phase D**:
- **API:** `GET /api/completed/cases` (`status_code IN (eva_submitted, done, box_synced)`, ordered by
  `submitted_at DESC NULLS LAST`, optional `?status=` + paging); add `completedCases()` to `rest-client.ts`.
- **SPA:** a `/completed` route + a **Completed** nav section *outside* the Queues group (work-queues stay
  work-only), showing a Delivered (`done`) vs Awaiting-delivery (`eva_submitted`) split.
- **Dashboard:** make the throughput tiles clickable → `/completed` (`STAGE_ROUTE.submitted = '/completed'`).
- **Search fold-in (TKT-072):** the `case_` search must **not** exclude terminals — include
  `eva_submitted` + `done` + `box_synced`, **exclude `removed`** (PII anonymised on soft-remove), with a
  status badge on result rows.

## Acceptance

- The Completed view lists `eva_submitted`/`done`/`box_synced` with the Delivered/Awaiting split; the
  three work-queues + counts are unchanged.
- Dashboard throughput tiles drill through to `/completed`.
- Global search returns a delivered case and hides `removed` cases.

## Research

Distilled 2026-07-07 from `PLAN-case-done-lifecycle.md` (Phase D); full plan in the anchor
[TKT-094](../TKT-094-case-done-status-model/TKT-094-case-done-status-model.md). Adds a terminal-scope
acceptance criterion to TKT-072.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
