---
id: TKT-008
title: Calendar picker on the date-of-incident / instruction fields
status: done
priority: P3
area: ui
tickets-it-relates-to: [TKT-011]
research-link: docs/tickets/done/TKT-008-calendar-date-fields/TKT-008-calendar-date-fields.md
---

# Calendar picker on the date-of-incident / instruction fields

## Problem
Add a calendar picker (date box) to the **"Date of Incident"** and **"Date of Instruction"** fields.

## Evidence
These are EVA-contract date fields on the case page. A Fluent date-picker component should back them.
See the research pack for the exact field locations.

## Proposed change
Attach a calendar/date-picker control to both date fields, keeping the stored format EVA-compliant.

## Acceptance
Both fields offer a calendar picker; the selected value is stored in the expected date format.

## Research
- Operator stub: [calendar-box-on-date-fields.md](TKT-008-calendar-date-fields.md)
- Research pack: [research/calendar-box-on-date-fields.md](TKT-008-calendar-date-fields.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
