---
id: TKT-044
title: Mileage calculations look ~10,000 over expected values
status: backlog
priority: P2
area: enrichment
tickets-it-relates-to: []
research-link: docs/tickets/TKT-044-mileage-calc-check/evidence/operator-note.md
---

# Mileage calculations look ~10,000 over expected values

## Problem (operator drop-note, verbatim in [evidence/operator-note.md](./evidence/operator-note.md))

Some mileage calculations appeared potentially **10,000 over** expected values — the MOT-derived
mileage estimate (enrichment) needs its calculation checked against known-good examples.

## Notes

Authored 2026-07-02 from the bare drop-note during the rules-engine-v2 doc-hygiene pass (this ticket
is **not** part of that plan — it's an enrichment-calculation check). Remember the ADR-0006
precedence: a document-extracted mileage is authoritative and suppresses the MOT estimate, so any fix
here only affects cases with no document mileage.

## Acceptance

A handful of real cases re-run through enrichment produce mileage estimates that match manual
expectation (or the calculation bug is identified and fixed with a unit test).
