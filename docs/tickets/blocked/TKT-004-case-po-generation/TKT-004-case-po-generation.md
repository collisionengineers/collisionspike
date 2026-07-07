---
id: TKT-004
title: Allocate the next Case/PO number reliably
status: blocked
priority: P1
area: intake
tickets-it-relates-to: [TKT-003]
research-link: docs/plans/work-todo-spike/box/research/case-po-gen.md
---

# Allocate the next Case/PO number reliably

## Problem
The system must confirm the **most up-to-date Case/PO number** before minting a new one. Likely a dual
source: (a) if the provider has been through the system before, we know their last number; (b) if not,
look up Box and take the most recent provider folder + 1 (e.g. for QDOS, find the latest `QDOS…` folder
and increment).

## Evidence
Case/PO format = `Principal` (leading-alpha provider code) + 2-digit year + 3-digit sequence (e.g.
`CCPY26050`); the Box folder is named with it. Allocation must be server-side, unique, and
concurrency-safe (the allocator owns the sequence; Postgres is the system of record).

## Proposed change
Add a server-side Case/PO allocator that reads the last sequence from Postgres for a known provider, and
falls back to a Box folder scan (latest provider folder + 1) for a new provider, with uniqueness +
concurrency guards.

## Acceptance
Two concurrent intakes for the same provider never collide; a brand-new provider's first number derives
correctly from Box; the minted Case/PO matches the folder name.

## Research
- Operator stub: [case-po-gen.md](../../../plans/work-todo-spike/box/case-po-gen.md)
- Research pack: [research/case-po-gen.md](../../../plans/work-todo-spike/box/research/case-po-gen.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
