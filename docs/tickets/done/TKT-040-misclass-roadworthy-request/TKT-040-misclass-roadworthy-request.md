---
id: TKT-040
title: Informal roadworthy work-request misrouted to 'Other'
status: done
priority: P2
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/done/TKT-040-misclass-roadworthy-request/evidence/operator-note.md
---

# Informal roadworthy work-request misrouted to 'Other'

## Problem
An inbound email was placed into the **'Other'** category, but it is actually a **work request** — just one
that does not provide instructions in the formal way the classifier expects. Routing genuine work to 'Other'
means a real engagement is not picked up.

## Evidence
Files in `evidence/`:
- `(EREF5) RTA on 27_06_2026  Mr Mohammed Osman Ahmed (Our Ref HMA_46428_1, Vehicle WN14XPZ).eml` — the inbound
  email, with an RTA date, client name, an "Our Ref" (HMA_46428_1), and a vehicle registration (WN14XPZ) — the
  shape of a work request, but phrased informally rather than as a formal instruction set.
- `2_CLVDamage4-V1.jpg`, `3_CLVDamage3-V1.jpg`, `4_CLVDamage2-V1.jpg`, `CLVDamage5-V1.jpg` — four damage photos
  of the vehicle, consistent with a request to assess/inspect.

## Proposed change
PROPOSED: Broaden the work-request detection so an email that carries the markers of a job — RTA date, client
name, "Our Ref", a vehicle registration, and damage photos attached — is treated as a work request even when
it lacks a formal instructions document. Attached damage images plus vehicle/case identifiers are a strong
work signal that should outweigh the absence of formal instruction wording, rather than falling through to
'Other'. Fold into the shared email-classification ruleset (TKT-006). First-pass approach only.

## Acceptance
- Re-intaking the sample does **not** land in 'Other'; it routes to work-request / new-case handling.
- Damage-photo attachments plus vehicle/case identifiers (reg, Our Ref) are recognised as a work signal absent
  formal instructions.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
