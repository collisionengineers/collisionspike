---
id: TKT-036
title: Work-instructions email misclassified as query
status: done
priority: P1
area: email
tickets-it-relates-to: [TKT-006]
research-link: docs/tickets/TKT-036-misclass-instructions/evidence/operator-note.md
---

# Work-instructions email misclassified as query

## Problem
An inbound email carrying formal work instructions for a new case was classified as a **query** instead of
instructions. Instructions emails are first-class intake — misrouting them as a query means a genuine new
engagement is not picked up as work to be done.

## Evidence
Files in `evidence/`:
- `Our Ref 206848.001 - Kassar Saeed - New eng ins.eml` — the inbound email (subject references "New eng ins"
  i.e. new engineer instructions).
- `To Engineer with instructions.DOC` — the attached instructions document ("To Engineer with instructions"),
  the formal instruction set that should mark this as an instructions email rather than a query.

The pairing of a "new eng ins" subject with a "...with instructions" attachment is the signal the classifier
missed.

## Proposed change
PROPOSED: Strengthen the classifier so an email bearing an instructions-style attachment and/or instruction
subject cues ("instructions", "eng ins", "new engineer instructions") is classified as instructions / new-case
work rather than a query. Treat the attachment filename/content as a strong instructions signal. Fold into the
shared email-classification ruleset (TKT-006). First-pass approach only — confirm against the wider corpus
before tuning thresholds.

## Acceptance
- Re-intaking `Our Ref 206848.001 - Kassar Saeed - New eng ins.eml` classifies it as an instructions /
  work-to-do email, not a query.
- The instructions attachment is recognised as an instructions signal.
- No regression that re-flags genuine queries as instructions.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
