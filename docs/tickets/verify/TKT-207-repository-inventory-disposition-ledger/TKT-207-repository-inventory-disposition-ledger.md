---
id: TKT-207
title: Build the complete repository inventory and disposition ledger
status: verify
priority: P0
area: docs
tickets-it-relates-to: [TKT-020, TKT-208, TKT-209, TKT-211, TKT-213, TKT-214]
research-link: docs/tickets/verify/TKT-207-repository-inventory-disposition-ledger/evidence/operator-note.md
plan: PLAN-006
---

# Build the complete repository inventory and disposition ledger

## Problem
A safe full-tree reset needs a provably complete account of the current repository. Counts and sampled paths are not enough: without one row per file and directory, moves, deletions, duplicate evidence and hidden outputs cannot be reconciled at close-out.

## Evidence
- The planning snapshot contains 3,268 tracked files, 775 tracked directory paths and 602,332,769 tracked bytes.
- Documentation contains 1,587 tracked files across 537 directory paths; tickets contain 1,113 files.
- Tracked state alone does not describe untracked, ignored, generated, dependency, empty-directory, symlink or submodule material visible in a working checkout.

## Proposed change
Create deterministic pre-change and final inventories and one disposition ledger. The ledger is the controlling map for every PLAN-006 move and deletion, and TKT-214 must reject an unexplained path or count difference.

## Acceptance
- **A1.** The immutable pre-change inventory lists every Git-tracked file and ancestor directory. The
  final verification additionally emits a complete physical-checkout inventory covering tracked,
  untracked, ignored, empty, binary, symlink, generated, dependency and repository-internal material;
  mutable repository metadata and the object database are enumerated but not content-hashed.
- **A2.** Every physical-checkout item records normalized path, kind, tracked/ignored state, byte length
  where applicable, SHA-256 or an explicit null-hash policy, top-level owner, purpose and
  evidence/source-authority classification.
- **A3.** Every pre-change tracked item has exactly one disposition: keep, move, rewrite or delete. Each
  row includes reason, owning ticket and final path or deletion proof; every final tracked row records
  its baseline origin or PLAN-006 creation/regeneration owner.
- **A4.** Binary evidence is inventoried without lossy conversion. Duplicate hashes are grouped, but every logical path occurrence remains independently represented.
- **A5.** A human-readable current tree and proposed tree are generated from the same inventory data; their counts reconcile to the machine-readable ledger.
- **A6.** The final tracked inventory uses the same repository schema and records every final tracked
  file and ancestor directory. A deterministic reconciliation proves every pre-change tracked row
  reached its stated disposition and every final tracked row has an owner and origin. The physical
  inventory is retained as a CI/PR artifact because dependency and generated paths are checkout-local.
- **A7.** Final reconciliation reports zero unexplained additions, omissions, duplicate authorities, orphan directories, unowned outputs or unresolved dispositions.
- **A8.** The inventory and reconciliation commands are documented, repeatable on a clean checkout and perform no live read or write.

## Validation
- Run inventory twice without repository changes and compare byte-identical normalized outputs.
- Add controlled tracked, untracked, ignored, empty, binary and duplicate-hash fixtures and prove each class is represented and reconciled.
- Independently sample every disposition class and compare filesystem state, Git state, size and hash to the ledger.

## Research
Distilled from the operator's requirement to inventory every folder and file before a repository-wide cleanup.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
