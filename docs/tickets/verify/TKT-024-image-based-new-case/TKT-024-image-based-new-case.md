---
id: TKT-024
title: Image-only new-case form (drop instruction-only fields)
status: verify
priority: P2
area: ui
tickets-it-relates-to: [TKT-002]
research-link: docs/tickets/verify/TKT-024-image-based-new-case/evidence/operator-note.md
plan: PLAN-003
---

# Image-only new-case form (drop instruction-only fields)

## Problem
The "Image based new case" flow was incorrectly modelled on "image based
assessment". They are different things. This flow is for creating a case from
**only images, no instructions**. Because there are no instructions, the
instruction-only fields cannot be populated and should not be presented or
required on this form.

## Evidence
- `evidence/operator-note.md` — the operator's field-by-field list of what to
  remove vs keep.
- `evidence/1.png`, `evidence/2.png`, `evidence/3.png`, `evidence/4.png` — four
  screenshots of the current new-case form showing the instruction-only fields
  that should not appear in the image-only flow.

## Proposed change
PROPOSED (not built): an image-only new-case form variant that:
- **Removes / does not require** the instruction-only fields:
  Work Provider, Case/PO, Providers Ref, Intake Status (should be automatic
  regardless), Accident Circumstances, Reason for image-based assessment,
  Date of Incident, Date of Instruction, Inspect on (inspection date).
- **Relaxes** Insured Name (and claimant details) to **not required**.
- **Keeps as required**: Received From, Received On (auto-default to today),
  Vehicle Details, Location.

## Acceptance
- Choosing the image-only new-case flow shows a form with only the kept fields;
  the listed instruction-only fields are absent (or present-but-not-required per
  the note).
- Required fields are Received From, Received On (defaulting to today), Vehicle
  Details, and Location; Insured Name / claimant details are optional.
- Intake status is set automatically, not via a form field.
- A case can be created from images alone without being blocked by missing
  instruction-only fields.

## Reopened follow-up — 2026-07-12

The current image-only form still shows an `Insured Name` field and its vehicle/claimant inputs are visually disjointed. The image-only workflow needs one claimant identity field and a coherent responsive layout.

### Acceptance
- `Insured Name` is absent from the image-only new-case form, validation, submitted payload and related helper/error copy.
- One field labelled `Claimant name` remains available; the form does not duplicate the same person as insured and claimant.
- Existing stored insured data elsewhere in the product is not deleted or silently remapped by this UI change.
- Claimant, registration, make, model and mileage are grouped and aligned with a consistent label/input/error grid; the make/model pair and full-width mileage row no longer appear disconnected as in the supplied screenshot.
- Required/optional behavior follows the canonical image-only creation and readiness contracts: creation may remain possible with genuinely unavailable instruction-only details, while missing required EVA data keeps the resulting case Not Ready.
- The layout remains coherent at supported desktop/narrow widths and 200% zoom, with no clipped required marker, validation message, or horizontal page overflow.
- Component tests cover field absence, payload absence, claimant persistence, validation, responsive grouping and keyboard order.
- Deployed Chrome proof creates a designated image-only test case and verifies the resulting fields and Not Ready/Review placement without touching a production case.

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Current form screenshot](./evidence/current-form-layout.png)
- [Regression changes](./changes-regression-12-07-26.md)
- [Operator follow-up](./evidence/operator-followup-12-07-26.md)
