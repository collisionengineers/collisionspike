# Changes — TKT-259: Consolidate repo-shape file-enumeration and the generated-directory set

## Status

Implemented on branch `plan010/scripts-dedup`. Output-preserving; no live write. (This record
replaces an earlier "Not started" placeholder that had drifted from the landed implementation.)

## What changed

- `scripts/checks/repository-files.mjs` is the single source of the repo-shape enumeration and policy:
  `listRepositoryFiles`, `normalizeRepositoryPath`, the `GENERATED_DIRECTORY_SEGMENTS` set, and the
  `generatedDirectorySegment` predicate (separator-normalising, case-folding).
- `scripts/checks/check-repository-layout.mjs` now imports `listRepositoryFiles` and
  `generatedDirectorySegment` instead of carrying its own `trackedPaths()` enumeration and a raw,
  case-sensitive segment match.
- `scripts/checks/check-tracked-outputs.mjs` imports the same predicate.
- The two previously-divergent generated-directory sets are reconciled into the one set: `.artifacts`
  (was layout-only) and `.mypy_cache` / `.ruff_cache` / `.venv` / `.vite` (were tracked-outputs-only) now
  live alongside `.cache` / `.pytest_cache` / `__pycache__` / `coverage` / `dist` / `node_modules`.
- `check-repository-data-authority.mjs` and `repository-hygiene.mjs` are untouched (out of scope, A3).

## Structural delta

Both checks lose their bespoke enumeration/matching and share one predicate + one set. The net owned-file
and nonblank-line delta for PLAN-010 is captured by the aggregate `check:source-size` gate (PASS on the
current tree); the exact before/after line counts remain recoverable from Git history for this branch.

## Verification

See [verification.md](./verification.md): A1–A7 evidenced, `check:layout` / `check:outputs` PASS,
11/11 consumer tests (including the mixed-case + backslash predicate case), single-source enforced by the
TKT-261 drift guard.
