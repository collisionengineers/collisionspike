---
id: TKT-050
title: AX PDF accident circumstances extraction too deep
status: done
priority: P1
area: parsing
tickets-it-relates-to: [TKT-001]
research-link: docs/tickets/TKT-050-ax-pdf-extract/evidence/operator-note.md
---

# AX PDF accident circumstances extraction too deep

## Problem
AX PDF accident circumstances extraction runs too far down the form, picking up the
**Pre Existing / Damage** table rows (e.g. `n.a`) after the real narrative. This
occurs on most AX PDFs. Targeting extraction better is preferred over post-hoc filtering.

## Evidence
- Sample intake email: [New inspection request - AX Ref1074398.eml](./evidence/new-inspection-request-ax-ref1074398.eml)
- AX audit texts show the layout: `Circumstances` → narrative → `Pre Existing` / `Damage` → `Bodyshop Details`
  (`cedocumentmapper_v2.0/docs/testing/cli_audit_current/texts/AX_01.txt` et al.)

## Proposed change
- Add a first-pass `Circumstances || Pre Existing` label pair for the AX provider, with
  `Circumstances || Bodyshop Details` as fallback when the Pre Existing row is absent.
- Harden `between_labels` line iteration so a missing end marker does not capture through EOF.

## Acceptance
- AX PDFs with a Pre Existing row extract accident circumstances **without** the Pre Existing / Damage tail.
- AX PDFs without a Pre Existing row still extract correctly (fallback pair).
- Offline unit tests cover both shapes.

## Research
Operator drop-note in [evidence/operator-note.md](./evidence/operator-note.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Sample email](./evidence/new-inspection-request-ax-ref1074398.eml)
