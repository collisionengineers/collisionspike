---
id: TKT-128
title: "Imported details — from the instruction document or email" renders blank
status: verify
priority: P2
area: ui
tickets-it-relates-to: [TKT-054, TKT-028]
research-link: docs/tickets/verify/TKT-128-imported-details-blank/evidence/operator-note.md
plan: PLAN-003
---
# TKT-128 — "Imported details — from the instruction document or email" renders blank

## Problem

The case-page "Imported details" panel ("From the instruction document or email.") displays nothing, even on cases whose instructions were parsed. Either the data seam is broken or the render is.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.

## Proposed change

PROPOSED (not built): root-cause (API payload vs SPA render), fix the seam, and show the parsed instruction fields with a graceful empty state when a case genuinely has no parsed source.

## Acceptance

- On a case with parsed instructions the panel shows the imported fields.
- On a case without parsed source the panel shows an explicit plain-English empty state (not blank).
- Verified live on a real parsed case.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
