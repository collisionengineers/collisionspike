---
id: TKT-163
title: Repair the merge-case dialog layout
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-052]
research-link: docs/tickets/backlog/TKT-163-merge-dialog-layout/evidence/operator-note.md
plan: PLAN-004
---

# Repair the merge-case dialog layout

## Problem
The merge-case dialog allows its heading and supporting case information to overlap and clip. That makes a consequential action hard to read and can hide the identity of the source or destination case.

## Evidence
- [Operator note](./evidence/operator-note.md) — screenshot-backed UI report.
- [Source note](./evidence/source-evidence/ui-bug.md), [screenshot](./evidence/source-evidence/screenshot.png), and [highlighted screenshot](./evidence/source-evidence/screenshot-highlighted.png) — preserved distillation inputs.
- TKT-052 owns merge behavior but its acceptance does not cover responsive dialog layout.

## Proposed change
PROPOSED (not built): give the dialog a stable content hierarchy and responsive width/overflow behavior while retaining the existing merge contract.

## Acceptance
- The dialog heading, source-case summary, destination-case control, warning and actions have distinct non-overlapping regions at supported desktop widths and browser zoom levels.
- Long claimant, registration, provider and Case/PO values wrap or truncate with an accessible full-value affordance; they never cover controls or the dialog close button.
- The dialog remains usable at 200% zoom and at the application's narrow supported viewport without horizontal page overflow.
- Keyboard focus enters the dialog predictably, remains trapped while open, reaches both actions, and returns to the trigger when closed.
- Source and destination cases are unambiguous immediately before confirmation, and the destructive/consequential action retains clear handler-facing copy.
- Existing merge validation, idempotency and server behavior from TKT-052 are unchanged.
- Component tests cover representative long values; a visual regression or browser check covers the supplied failure width plus narrow and 200% zoom states.
- The deployed SPA is checked in Chrome with no overlap, clipping, console error or failed merge-related request on a designated test case.

## Research
Distilled 2026-07-12 from `docs/tickets/to-distill/ui-bug-merge-case/`; the note and screenshots are preserved in this ticket's evidence folder.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Source note](./evidence/source-evidence/ui-bug.md)
- [Screenshot](./evidence/source-evidence/screenshot.png)
- [Highlighted screenshot](./evidence/source-evidence/screenshot-highlighted.png)
