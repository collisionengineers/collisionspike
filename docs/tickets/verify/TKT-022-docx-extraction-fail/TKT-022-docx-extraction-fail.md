---
id: TKT-022
title: .docx claim-form extraction fails
status: verify
priority: P1
area: parsing
tickets-it-relates-to: [TKT-001]
research-link: docs/tickets/verify/TKT-022-docx-extraction-fail/evidence/operator-note.md
---

# .docx claim-form extraction fails

## Problem
Extraction / enrichment does not work correctly on a Word `.docx` claim form
("A Cheema Claim Form docx.docx"). The parsed fields come back badly misaligned
and garbled: required fields are left empty or mis-mapped, and large blocks of
the form's question text are dumped into the wrong field. (The operator note
itself is empty; the ask is reconstructed from the supplied screenshots and the
sample `.docx`.)

## Evidence
- `evidence/A Cheema Claim Form docx.docx` — the source Word claim form that was
  ingested.
- `evidence/1.png` — case header: VRM rendered as `SN67USB`, with "and colour
  MINI-RED" leaking into the vehicle display (vehicle parsing offset).
- `evidence/2.png` — Fields tab: **Work Provider** empty (required, flagged
  "Required"); **Claimant Name** mis-mapped to the text "happy to be contacted
  by email?"; **Claimant Email** captured as "-ajmal.cheema@yahoo.com" (leading
  dash); **Vehicle Model** captured as "and colour MINI-RED".
- `evidence/3.png` — **Accident Circumstances** stuffed with the entire form's
  question text (hospital/GP/injury questionnaire), and **Inspection Address** /
  **Date of Instruction** left empty (required, flagged "Required").

## Proposed change
PROPOSED (not built):
- Treat `.docx` as a first-class input format in the parser engine
  (`cedocumentmapper_v2.0` sibling → vendored parser Function), extracting the
  document text/structure properly rather than letting field boundaries bleed
  into adjacent fields.
- Improve field segmentation for the structured claim-form layout so labelled
  values land in the right target fields (claimant name vs email, vehicle make/
  model/colour split, accident circumstances bounded to the narrative).
- Re-validate against this exact sample so the known mis-maps (work provider,
  claimant name, vehicle model, accident-circumstances overflow) are corrected.

## Acceptance
- The sample `.docx` extracts with Work Provider, Claimant Name, Claimant Email,
  Vehicle Model, and Accident Circumstances each populated from the correct
  source field (no cross-field overflow, no leading-dash artifacts).
- Required fields that are present in the document are populated rather than
  flagged "Required".
- No regression for the PDF/email claim-form path.

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
