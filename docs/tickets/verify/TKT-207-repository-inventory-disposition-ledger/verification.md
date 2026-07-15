# Verification — TKT-207: Build the complete repository inventory and disposition ledger

## Verdict
TESTED (offline)

## Evidence
- Commit 70a3bb57 fixes the pre-mutation baseline and move/delete/preserve boundary.
- The current generated inventory is scoped to Git-tracked files and contains 2,888 files, 903
  directories and 3,791 total entries, representing 495,939,867 file bytes.
- Every file row records path, media type, size, SHA-256, category, owner and lifecycle. Directory hashes
  and the inventory's self-hash are null under explicit policies.
- Evidence hashing groups identical bytes while retaining 550 path-level usages; the separate
  disposition manifest accounts for 94 deliberately non-retained occurrences.
- node scripts/maintenance/generate-repository-inventory.mjs --check passes against the generated file.
- Baseline reconciliation accounts for all 3,269 pre-mutation tracked files against all 2,888 final
  tracked files with zero unexplained rows. Every final row records its baseline origin or owning ticket.
- The final cleaned physical-checkout inventory enumerates 74,793 entries: 70,318 files, 4,471 directories
  and 70,996 ignored entries, including dependency trees, generated output, empty directories, symlinks
  and Git internals. The local artifact self-removes; CI uploads the same generated audit artifact.
- The repository map and machine inventory are generated/current navigation authorities and require no
  live access.

## Pending / gaps
- Remote CI and independent samples across each disposition class remain pending.

## How to re-verify
Run node scripts/maintenance/generate-repository-inventory.mjs, then rerun it with --check from the
final clean checkout. Compare the resulting counts to Git's tracked path set and sample each keep, move,
rewrite, delete, regenerate, dependency-only and workingspace-only disposition class.
