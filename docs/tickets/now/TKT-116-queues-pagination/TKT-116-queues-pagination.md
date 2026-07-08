---
id: TKT-116
title: Paginate the case queues at 15 per page (same as the inbox)
status: now
priority: P2
area: ui
tickets-it-relates-to: [TKT-098]
research-link: docs/tickets/now/TKT-116-queues-pagination/evidence/operator-note.md
plan: PLAN-003
---
# TKT-116 — Paginate the case queues at 15 per page (same as the inbox)

## Problem

The case queue views render every case in one unbounded list. The inbox already caps its page at 15 emails with a pager (TKT-098); the queues need the same treatment so long queues stay scannable.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- TKT-098 (done) is the inbox pagination pattern to copy.

## Proposed change

PROPOSED (not built): apply the TKT-098 pagination pattern to each case queue list — 15 cases per page with the same pager control, page state kept per queue so switching queues does not reset unexpectedly.

## Acceptance

- Every queue view shows at most 15 cases per page, with the same pager control as the inbox.
- Queues with more than 15 cases page correctly (counts match the dashboard totals).
- Verified live on the deployed SPA against a queue holding more than 15 cases.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
