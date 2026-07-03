---
id: TKT-025
title: Mark + filter inbox by source mailbox (info/engineers/desk)
status: now
priority: P2
area: email
tickets-it-relates-to: [TKT-005]
research-link: docs/tickets/TKT-025-inbox-source-filter/evidence/operator-note.md
---

# Mark + filter inbox by source mailbox (info/engineers/desk)

## Problem
Intake now flows from multiple shared mailboxes (info@, engineers@, desk@) but
there is no way to tell which mailbox a given item arrived through, nor to filter
the inbox by source mailbox. Staff need a discernible **visual marker**
distinguishing the source mailbox per item, plus a **filter** to narrow the
inbox to a chosen source.

## Evidence
- `evidence/operator-note.md` — the operator's drop-note asking for a discernible
  marker between the info / engineers / desk email addresses and a filter option.

## Proposed change
PROPOSED (not built):
- Surface the **source mailbox** on each inbox item (it is known at intake; the
  live mailbox set is in the registry — do not hard-code it here) and render a
  discernible per-source visual marker (e.g. a labelled tag/colour chip for
  info@ / engineers@ / desk@).
- Add an inbox **filter** control to show only items from a chosen source
  mailbox (and an all-sources default).

## Acceptance
- Each inbox item shows which source mailbox it arrived through, with a marker
  distinguishable at a glance between info@, engineers@ and desk@.
- A filter lets staff restrict the inbox to a single source mailbox and back to
  all.
- The marker/filter source list follows the live mailbox set (registry), not a
  hard-coded list.

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
