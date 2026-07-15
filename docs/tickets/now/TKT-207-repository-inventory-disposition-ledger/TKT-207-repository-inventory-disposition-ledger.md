---
id: TKT-207
title: Build the complete repository inventory and disposition ledger
status: now
priority: P0
area: docs
tickets-it-relates-to: [TKT-020, TKT-208, TKT-209, TKT-211, TKT-213, TKT-214]
research-link: docs/tickets/now/TKT-207-repository-inventory-disposition-ledger/evidence/operator-note.md
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
- **A1.** The pre-change inventory lists every filesystem file and directory under the repository root, including tracked, untracked, ignored, empty, binary, symlink, submodule, generated and dependency material, while excluding only the repository's internal object database from content hashing.
- **A2.** Every item records normalized path, kind, tracked/ignored state, byte length where applicable, SHA-256 for files, current top-level owner, current purpose and evidence/source-authority classification.
- **A3.** Every pre-change item has exactly one disposition: keep, move, rewrite, delete, regenerate, dependency-only or workingspace-move-only. Each row includes reason, owning ticket and final path or deletion proof.
- **A4.** Binary evidence is inventoried without lossy conversion. Duplicate hashes are grouped, but every logical path occurrence remains independently represented.
- **A5.** A human-readable current tree and proposed tree are generated from the same inventory data; their counts reconcile to the machine-readable ledger.
- **A6.** The final inventory uses the same schema and records every final file and directory. A deterministic reconciliation proves every pre-change row reached its stated disposition and every final row has an owner and origin.
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
