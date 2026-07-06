---
id: TKT-086
title: Accident circumstances still not being 100% extracted
status: backlog
priority: P1
area: parsing
tickets-it-relates-to: [TKT-001, TKT-050]
research-link: docs/tickets/TKT-086-circumstances-extraction-gaps/evidence/operator-note.md
---

# Accident circumstances still not being 100% extracted

## Problem

Operator: "Many circumstances still not being 100% extracted." The accident-circumstances field
is coming through partial (or empty) on many live cases despite the TKT-050 boundary fix
(AX PDFs, verified live 2026-07-01). The dropped sample — a `.DOC` instruction + its carrier
`.eml` — is a concrete failing (or partially-failing) case to anchor the fix. Circumstances is
one of the EVA 12 fields, so extraction gaps translate directly into manual re-keying at EVA
submission.

## Problem scope note

"Many" implies a corpus-wide gap, not one layout: treat this as (a) fix the dropped sample's
layout, and (b) **measure** circumstances coverage across live cases so the residual gap is
known, instead of whack-a-mole.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note.
- `evidence/Instructions.DOC` + `evidence/message.eml` — the failing sample pair (binary
  `.DOC` — the format lane TKT-001 flagged as needing an e2e Postgres proof on the triage `.doc`
  path).
- Prior fixes: [TKT-050](../TKT-050-ax-pdf-extract/TKT-050-ax-pdf-extract.md) (AX circumstances
  boundary), [TKT-001](../TKT-001-document-parsing/TKT-001-document-parsing.md) (multi-format
  extraction + field-drop).
- Extraction engine is dual-home (ADR-0018): edit the `cedocumentmapper_v2.0` sibling first,
  then re-vendor into the parser Function.

## Proposed change

PROPOSED (not built):

- Run the sample pair through live `/api/parse`; record exactly which circumstances content is
  missed (wrong boundary, wrong label, `.DOC` extraction gap).
- Fix in the sibling engine (layout/label rules for this provider's `.DOC` template), add the
  sample to the sibling's extraction fixtures, re-vendor.
- **Coverage measurement**: a one-off audited query/script reporting circumstances
  populated/empty/suspiciously-short across live cases by provider + document type — the residual
  gap becomes follow-up fixtures or tickets.

## Acceptance

- [ ] The sample pair extracts its full circumstances narrative (verbatim target recorded in
      `evidence/` once parsed) via `/api/parse`.
- [ ] The sibling's extraction test suite carries the new fixture; the full suite passes
      (no regression on AX/other layouts, honouring TKT-050's boundary pins).
- [ ] A circumstances-coverage report over live cases exists in this folder, with the residual
      misses either fixed or listed as named follow-ups.

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline tests** — sibling suite green with the new fixture; re-vendor recorded (PROVENANCE
   updated); outputs in [verification.md](./verification.md).
2. **Gate + deploy** — `node verify-all.mjs` green; parser deploy recorded in
   [changes.md](./changes.md). (Windows-local parser-test failures that are environmental are
   already known — record WSL results.)
3. **Live probe** — live `/api/parse` on the sample returns the full circumstances text; a
   re-intake proves the value lands in Postgres.
4. **Coverage evidence** — the before/after coverage numbers (populated % by provider) recorded,
   demonstrating measurable improvement or an explained residual.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/circumstances/`; raw material
in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
