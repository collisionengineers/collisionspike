---
id: TKT-099
title: QCL cases not generating Case/PO correctly
status: done
priority: P1
area: intake
tickets-it-relates-to: [TKT-004, TKT-028]
research-link: docs/tickets/done/TKT-099-qcl-case-po-generation/evidence/operator-note.md
plan: PLAN-003
---

# QCL cases not generating Case/PO correctly

## Problem

Cases for the **QCL** work provider are not minting a correct Case/PO. The Case/PO format is a
leading-alpha provider (`Principal`) code + 2-digit year + 3-digit provider case number (e.g.
`QCL26050`); QCL intake is producing a wrong or absent Case/PO.

## Evidence

- [evidence/operator-note-2026-07-08.md](./evidence/operator-note-2026-07-08.md) — 2026-07-08 operator re-report (workstream item 8): vd@complexreports.com marked New client work; case minted under QCL without a Case/PO so no Box folder; sender is always QCL.
- `evidence/operator-note.md` — "QCL cases seemingly not generating case/po correctly."
- **No sample email/case supplied** — a real QCL instruction email or a live QCL case id would let us
  reproduce and pin the acceptance test. Filing anyway because the bug is a specifiable allocator path
  (this is not blocked on the sample, unlike TKT-035).

## Proposed change

PROPOSED (not built):
- Trace the QCL principal-code path through the Case/PO allocator (DB last-number + Box
  latest-folder + 1, per TKT-004): confirm QCL exists in the provider corpus with the correct principal
  code, and that the allocator resolves it rather than falling back.
- Fix the mint/config so a QCL intake produces a valid `QCL…` Case/PO; add a regression test.

## Acceptance

- A QCL intake mints a valid, correctly-formatted `QCL…` Case/PO (leading-alpha + year + 3-digit number).
- Regression coverage for the QCL allocator path.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/qcl/`; raw material in [evidence/](./evidence).
Sits in TKT-004 (Case/PO allocation) / TKT-028 (work_provider population) territory.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
