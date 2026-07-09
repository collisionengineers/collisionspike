---
id: TKT-100
title: QDOS false VRM "AND2" invented on emails that don't contain it
status: done
priority: P1
area: parsing
tickets-it-relates-to: [TKT-085, TKT-071, TKT-101]
research-link: docs/tickets/done/TKT-100-qdos-false-vrm-and2/evidence/operator-note.md
---

# QDOS false VRM "AND2" invented on emails that don't contain it

## Problem

Every QDOS example email logs **AND2** as the vehicle registration even though "AND2" appears **nowhere**
in the email — a hallucinated / false-positive VRM. This is a shape-sibling of TKT-085 ("OCTOBER" month
word) and TKT-071 ("HD4110" job ref) but specific to the QDOS layout.

## Evidence

- `evidence/operator-note.md` — "All example emails list AND2 as the registration but this is not listed
  on the email".
- `evidence/46533_1 - Barry Pavlou..eml`, `46640_1 - Andy Smith.eml`, `46670_1 - Mohammed Jameel.eml`,
  `46671_1 - Michael McCarthy.eml` — the four QDOS samples (all wrongly showing AND2).

## Proposed change

PROPOSED (not built):
- Root-cause where "AND2" is captured from the QDOS layout (likely a loose/anchorless VRM sniff picking
  up a token that resembles a plate).
- Suppress it: proximity-anchor the rule and/or add "AND2" (and similar non-plate tokens) to the VRM
  denylist; mirror the fix into the Python sniff (ADR-0018).
- Audited data fix for existing QDOS cases carrying the bogus AND2 VRM.

## Acceptance

- Parsing the four QDOS samples yields **no** "AND2" VRM (correct VRM or none).
- An eval/regression pin covers the QDOS false-positive.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/qdos-error/`; raw material in
[evidence/](./evidence). The wrong-case-linking half of the same note is
[TKT-101](../../now/TKT-101-qdos-cases-wrong-linking/TKT-101-qdos-cases-wrong-linking.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
