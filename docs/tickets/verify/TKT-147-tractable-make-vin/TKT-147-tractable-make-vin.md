---
id: TKT-147
title: Tractable layout: capture vehicle make (two-label rule) + a VIN field slot
status: verify
priority: P3
area: parsing
tickets-it-relates-to: [TKT-102]
research-link: docs/tickets/verify/TKT-147-tractable-make-vin/evidence/operator-note.md
plan: PLAN-003
---

# TKT-147 — Tractable layout: capture vehicle make (two-label rule) + a VIN field slot

## Problem

The Tractable layout extracts model but not make (needs a two-label rule kind in the engine), and the engine has no VIN field slot at all.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — final-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): sibling-first — add a two-label capture rule kind + a VIN envelope field; fixtures on the Tractable samples.

## Acceptance

- Tractable samples extract make + model (+ VIN where present) with fixtures.
- No regression in the sibling suite.

## Research

Filed 2026-07-09 from the final-wave D2 report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
