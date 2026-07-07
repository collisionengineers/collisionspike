---
id: TKT-098
title: Inbox pagination — cap the inbox page at 15 emails, paginate the rest
status: backlog
priority: P3
area: ui
tickets-it-relates-to: [TKT-005, TKT-025, TKT-054]
research-link: docs/tickets/TKT-098-inbox-pagination/evidence/operator-note.md
---

# Inbox pagination — cap the inbox page at 15 emails, paginate the rest

## Problem

The inbox page renders every email on a single page. The operator wants the inbox list capped at **15
emails per page**, with further emails moved onto separate pages.

## Evidence

- `evidence/operator-note.md` — "Need to limit the e-mails shown on the inbox page to 15 at max. Further
  emails moved onto separate pages."

## Proposed change

PROPOSED (not built):
- Add pagination to the SPA inbox list (15 rows/page) with a pager control.
- Preserve the existing mailbox-chip source filter (TKT-025) and the inbox actions (TKT-005) across
  pages; decide client-side vs server-side paging against the current inbox data seam.

## Acceptance

- The inbox shows at most 15 emails per page with a working pager.
- The mailbox-chip filter and dismiss/actions behave correctly across pages; sort order preserved.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/e-mail-limit/`; raw material in
[evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
