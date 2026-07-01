---
id: TKT-001
title: Fix multi-format document extraction regression
status: now
priority: P1
area: parsing
tickets-it-relates-to: [TKT-002, TKT-017]
research-link: docs/plans/work-todo-spike/document-parsing/research/document-parsing.md
---

# Fix multi-format document extraction regression

## Problem
Extraction is only reliably returning the registration; the rest of the 12-field EVA payload is coming
back sparse. Parsing must work across **PDF, .doc, .docx, .eml and .msg**. Need to find the source of
the regression.

## Evidence
The parser engine is the vendored `cedocumentmapper_v2.0` core in the retained parser Function
(`cespike-parser-dev`, `POST /api/parse`). Authoring source of truth is the sibling repo (edit-in-sibling,
re-vendor — ADR-0018). See the research pack for the suspected drift points and the format coverage gaps.

## Proposed change
Diff the vendored engine vs the sibling, identify what regressed the multi-field extraction, restore
full-field coverage across all five formats, and re-vendor + redeploy the parser Function.

## Acceptance
A representative instruction in each of PDF / DOC / DOCX / EML / MSG returns the populated EVA fields
(not just the registration), with field-level provenance, verified by re-intake.

## Research
- Operator stub: [document-parsing.md](../../plans/work-todo-spike/document-parsing/document-parsing.md)
- Research pack: [research/document-parsing.md](../../plans/work-todo-spike/document-parsing/research/document-parsing.md)
- Sample instruction fixtures live under [pdf-image-extraction/](../../plans/work-todo-spike/pdf-image-extraction/).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Follow-up regression 2026-07-01](./changes-regression-01-07-26.md)
- [Follow-up notes](./followup/followup.md)
