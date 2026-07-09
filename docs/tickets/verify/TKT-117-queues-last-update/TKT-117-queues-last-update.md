---
id: TKT-117
title: Show a "Last update" line for each case in the queues view
status: verify
priority: P2
area: ui
tickets-it-relates-to: [TKT-046, TKT-096]
research-link: docs/tickets/verify/TKT-117-queues-last-update/evidence/operator-note.md
plan: PLAN-003
---
# TKT-117 — Show a "Last update" line for each case in the queues view

## Problem

Queue rows carry no recency signal. Staff want a per-case "Last update" descriptor in the queues view — e.g. email received/sent, images received, note added by a named user, chased on a date — so they can see at a glance what last happened and how stale a case is.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- The case audit/activity trail (audit codes + case notes + chase log) already records these events server-side.

## Proposed change

PROPOSED (not built): derive a human-readable last-activity descriptor + timestamp per case from the existing audit/activity data (email received/sent, images received, note added by {user}, chased on {date}, status changes) and render it on each queue row. No engineering jargon in the rendered strings.

## Acceptance

- Each queue row shows a plain-English last-update descriptor and date (e.g. "Images received", "Chased 04/07/2026", "Note added by Alex").
- The descriptor updates when new activity lands on the case.
- No raw enum/status codes or engineering language in the rendered text.
- Verified live on the deployed SPA.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
