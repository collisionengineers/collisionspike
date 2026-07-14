---
id: TKT-004
title: Allocate the next Case/PO number reliably
status: blocked
priority: P1
area: intake
tickets-it-relates-to: [TKT-003, TKT-178]
research-link: docs/plans/work-todo-spike/box/research/case-po-gen.md
---

# Allocate the next Case/PO number reliably

## Problem
The system must mint above the complete valid historical maximum for the provider/year prefix, including
allocations visible only in terminal/retired lineage, EVA or the approved production Archive. The live
database maximum alone can be lower after a reset, while a “latest folder” name/listing can be incomplete,
ambiguous or outside the approved cutover roster. A missing or unreadable authoritative floor must stop
minting rather than silently fall back to a lower value.

## Evidence
Case/PO format = `Principal` (leading-alpha provider code) + 2-digit year + 3-digit sequence (e.g.
`CCPY26050`); the Box folder is named with it. Allocation must be server-side, unique, and
concurrency-safe (the allocator owns the sequence; Postgres is the system of record).

## Proposed change
Add a server-side allocator that locks the provider/year prefix and mints
`max(database maximum, approved historical floor) + 1` with uniqueness and concurrency guards. The floor
comes only from TKT-178's complete signed-ledger source union; authenticated EVA and exact approved Archive
objects provide evidence to that ledger, never a “latest folder + 1” shortcut. Floor health/read failures
remain fail-closed for as long as a historical floor is authoritative.

The production Archive fallback and root retarget are subordinate to TKT-178. A root id or Viewer/test
listing alone is not authority: the signed/checksummed job spreadsheet, authenticated contract-verified
production EVA API result and exact approved production Archive inventory/write scope must first reconcile
to the frozen approved ledger in the named future window.

## Acceptance
Two concurrent intakes for the same provider never collide. After every TKT-178 gate passes, each prefix
floor derives from every valid historical allocation in the closed-world ledger, not only active/current
Archive rows. Floor-read/health errors fail closed rather than falling back to a lower database maximum. The
predesignated journaled ingress canary mints above that floor and canonical metadata proves its immutable folder ID,
parent root and Case/PO name. Before then, production scanning/mint-root retarget fails closed and no
disposable live case is created for proof.

## Research
- Operator stub: [case-po-gen.md](../../../plans/work-todo-spike/box/case-po-gen.md)
- Research pack: [research/case-po-gen.md](../../../plans/work-todo-spike/box/research/case-po-gen.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
