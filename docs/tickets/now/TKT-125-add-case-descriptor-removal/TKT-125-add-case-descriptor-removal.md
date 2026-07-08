---
id: TKT-125
title: Remove the field descriptors under the Add Case inputs (and the wrong "4-char" principal claim)
status: now
priority: P3
area: ui
tickets-it-relates-to: []
research-link: docs/tickets/now/TKT-125-add-case-descriptor-removal/evidence/operator-note.md
plan: PLAN-003
---
# TKT-125 — Remove the field descriptors under the Add Case inputs (and the wrong "4-char" principal claim)

## Problem

The Add Case page shows helper descriptors under the text boxes — e.g. "The vehicle's number plate." below VRM and "4-char principal code, e.g. KBS." below principal. The operator wants them removed; the principal one is also factually wrong (principal codes are 2-5 chars, not always 4).

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- CLAUDE.md domain model: Principal is a leading-alpha code, typically 4 chars, 2-5 observed.

## Proposed change

PROPOSED (not built): remove the descriptor/hint texts under the Add Case fields; ensure no remaining copy claims a fixed 4-char principal length.

## Acceptance

- No descriptor text renders under the Add Case fields.
- No UI copy anywhere claims principal codes are fixed at 4 characters.
- Verified live on the deployed SPA.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
