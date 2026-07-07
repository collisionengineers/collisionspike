---
id: TKT-027
title: Intermediate intake status beyond 'new'
status: verify
priority: P2
area: intake
tickets-it-relates-to: [TKT-012]
research-link: docs/tickets/verify/TKT-027-intake-triage-status/evidence/operator-note.md
---

# Intermediate intake status beyond 'new'

## Problem
Everything currently shows a single "new" status. There is no way to distinguish
a case that has merely arrived from one that has been **added to / acknowledged
by the intake system** (triaged). Staff need an intermediate status so the board
reflects that a case has progressed past raw arrival, instead of everything
sitting at "new".

## Evidence
- `evidence/operator-note.md` — the operator's drop-note asking for a status for
  a case that's been added to the intake system instead of "new" for everything.
- `evidence/1.png` — screenshot showing cases all at "new".

## Proposed change
PROPOSED (not built):
- Add an intermediate intake status between raw arrival and review (e.g. an
  "added to intake" / "triaged" state) within the documented status machine
  (`new_email → ingested → needs_review → ready_for_eva → eva_submitted`),
  rather than overloading "new".
- Have the case transition into that status automatically once it has been
  ingested into the intake system, and surface it on the board/queues.

## Acceptance
- A case that has been added to the intake system shows a distinct status from a
  just-arrived "new" case.
- The new status is set automatically as part of ingestion (no manual step).
- The board/queues reflect the new status so staff can see progress at a glance.

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
