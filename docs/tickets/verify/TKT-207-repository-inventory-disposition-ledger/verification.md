# Verification — TKT-207: Build the complete repository inventory and disposition ledger

## Verdict
TESTED (offline)

## Evidence
- Commit 70a3bb57 fixes the pre-mutation baseline and move/delete/preserve boundary.
- The current generated inventory is scoped to stage-0 Git index files and contains 2,889 files, 903
  directories and 3,792 total entries, representing 495,938,373 file bytes.
- Every file row records path, media type, size, SHA-256, category, owner and lifecycle. Directory hashes
  and the inventory's self-hash are null under explicit policies.
- Evidence hashing groups identical bytes while retaining 550 path-level usages; the separate
  disposition manifest accounts for 94 deliberately non-retained occurrences.
- node scripts/maintenance/generate-repository-inventory.mjs --check passes against the generated file.
- Baseline reconciliation accounts for all 3,269 pre-mutation tracked files against all 2,889 final
  tracked files with zero unexplained rows. Every final row records its baseline origin or owning ticket.
- The complete-checkout audit accounts for every physical item at run time, including dependency trees,
  generated output, empty directories, symlinks and Git internals. The latest local fresh-install run
  enumerated 70,359 entries: 65,852 files, 4,503 directories and 66,561 ignored entries. These
  environment-dependent counts are evidence rather than a repository invariant; the local artifact
  self-removes and CI uploads its own generated audit artifact.
- The repository map and machine inventory are generated/current navigation authorities and require no
  live access.

## Pending / gaps
- Independent samples across each disposition class remain pending. Remote CI status is read from the
  PR checks rather than frozen in this file.

## How to re-verify
Stage the intended final tree, run node scripts/maintenance/generate-repository-inventory.mjs, then
rerun it with --check from the final clean checkout. Compare the resulting counts to Git's stage-0 index
and sample each keep, move,
rewrite, delete, regenerate, dependency-only and workingspace-only disposition class.
