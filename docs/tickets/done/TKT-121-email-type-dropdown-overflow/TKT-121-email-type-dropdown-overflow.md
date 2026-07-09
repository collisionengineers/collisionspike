---
id: TKT-121
title: The "E-mail Type" dropdown fills the whole page — cap its height with a scrollbar
status: done
priority: P3
area: ui
tickets-it-relates-to: [TKT-054]
research-link: docs/tickets/done/TKT-121-email-type-dropdown-overflow/evidence/operator-note.md
plan: PLAN-003
---
# TKT-121 — The "E-mail Type" dropdown fills the whole page — cap its height with a scrollbar

## Problem

The "E-mail Type" dropdown opens taller than the viewport and is not fully viewable. It needs a bounded max height with an internal scrollbar.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.

## Proposed change

PROPOSED (not built): cap the dropdown listbox height (~10 items) with overflow-y auto so every option stays reachable by scroll and keyboard.

## Acceptance

- The dropdown opens no taller than roughly 10 items with an internal scrollbar; all options reachable by mouse and keyboard.
- Verified live on the deployed SPA.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
