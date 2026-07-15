---
id: TKT-135
title: Circumstances coverage residual — needs one dropped sample per 0%-coverage provider layout
status: blocked
priority: P2
area: parsing
tickets-it-relates-to: [TKT-086, TKT-050]
research-link: docs/tickets/blocked/TKT-135-circumstances-provider-samples/evidence/operator-note.md
plan: PLAN-003
---

# TKT-135 — Circumstances coverage residual — needs one dropped sample per 0%-coverage provider layout

## Problem

The TKT-086 live coverage report shows 51.1% of 348 active cases carry circumstances; the residual concentrates in specific provider layouts (PCH 46/50 empty is the top). Fixing each layout needs one real dropped sample per provider (the TKT-086 sample pair turned out to carry no circumstances at source).

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — batch-B workflow finding, 2026-07-09.
- docs/tickets/done/TKT-086-circumstances-extraction-gaps/evidence/circumstances-coverage-2026-07-09.md — the per-provider residual table.

## Proposed change

BLOCKED on operator samples: one representative instruction document per 0%-coverage provider layout (PCH first). Then sibling-first layout/label rules + fixtures per ADR-0018.

## Acceptance

- Operator supplies at least the PCH sample; the sibling extracts its circumstances with a fixture.
- Coverage re-measured; residual providers enumerated or closed.

## Research

Filed 2026-07-09 from the classifier-wave batch report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence/)
