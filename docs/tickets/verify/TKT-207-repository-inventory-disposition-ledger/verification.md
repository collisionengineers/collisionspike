# Verification — TKT-207: Build the complete repository inventory and disposition ledger

## Verdict
TESTED (offline)

## Evidence
- Commit 70a3bb57 fixes the pre-mutation baseline and move/delete/preserve boundary.
- The current generated inventory is scoped to stage-0 Git index files and contains 2,889 files, 903
  directories and 3,792 total entries, representing 495,952,916 file bytes.
- Every file row records path, media type, size, SHA-256, category, owner and lifecycle. Directory hashes
  and the inventory's self-hash are null under explicit policies.
- Evidence hashing groups identical bytes while retaining 550 path-level usages; the separate
  disposition manifest accounts for 94 deliberately non-retained occurrences.
- node scripts/maintenance/generate-repository-inventory.mjs --check passes against the generated file.
- Baseline reconciliation reconstructs the permanent pre-reset main commit directly from Git tree/blob
  bytes: 3,268 files, 775 ancestor directories plus the repository root, and 599,264,933 normalized blob
  bytes. It accounts for all 2,889 final tracked files with zero unexplained rows; every final row records
  its baseline origin or owning ticket. The proof does not depend on a feature branch or retained ledger.
- The complete-checkout audit records every physical item and its exact run-time counts, including
  dependency trees, generated output, empty directories, symlinks and Git internals. Those counts vary
  with the host dependency installation and are evidence rather than a repository invariant; the local
  artifact self-removes and CI uploads its own generated audit artifact.
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
