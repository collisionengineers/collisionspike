# Verification — TKT-259: Consolidate repo-shape file-enumeration and the generated-directory set

## Verdict

PASS (offline, output-preserving). Independently re-verified 2026-07-19 on branch
`plan010/scripts-dedup`. The prior "PENDING / implementation has not started" record was a stale
placeholder — the consolidation had in fact landed; this records the actual acceptance evidence.

## Evidence

- **A1 — layout uses the shared enumerator.** `check-repository-layout.mjs` imports
  `{ generatedDirectorySegment, listRepositoryFiles }` from `repository-files.mjs` (line 5) and
  enumerates the tree via `listRepositoryFiles()` (line 96); there is no local `trackedPaths()`.
- **A2 — one policy, imported by both, drift reconciled.** `GENERATED_DIRECTORY_SEGMENTS` and the
  separator-normalising, case-folding `generatedDirectorySegment` predicate are defined once in
  `repository-files.mjs`, and both `check-repository-layout.mjs` and `check-tracked-outputs.mjs` import
  the predicate (neither re-declares it). The previously-drifted entries are reconciled into the single
  set — it now carries `.artifacts` (was layout-only) and `.mypy_cache` / `.ruff_cache` / `.venv` /
  `.vite` (were tracked-outputs-only), alongside `.cache` / `.pytest_cache` / `__pycache__` / `coverage`
  / `dist` / `node_modules`. The predicate normalises separators and case-folds each segment, so one
  matching rule now applies to both checks.
- **A3 — out-of-scope checks untouched.** `check-repository-data-authority.mjs` (prose scanner) and
  `repository-hygiene.mjs` (git/worktree report) are unchanged.
- **A4 — mixed-case / separator tests.** `node --test check-repository-layout.test.mjs
  check-tracked-outputs.test.mjs` → 11/11 pass, including "rejects mixed-case and backslash generated
  directories via the shared predicate" in BOTH suites (e.g. `.VENV`, backslash separators).
- **A5 — both remain independent CLI gates, verdicts unchanged.** `npm run check:layout` → PASS;
  `npm run check:outputs` → PASS on the current tree.
- **A6 — structural delta** recorded in [changes.md](./changes.md).
- **A7 — no live write.** Local source edits and read-only checks only.

Single-source is now machine-enforced: the TKT-261 drift guard (`check:scripts-dedup`) fails a consumer
that re-declares the set/predicate **or** imports only the raw set and rebuilds the predicate locally, and
fails a generator that reimplements the shared path normaliser.

## Pending / gaps

None. The consolidation is output-preserving (the layout and tracked-output verdicts are unchanged on the
current tree) and enforced by the drift guard.

## How to re-verify

`npm run check:layout` and `npm run check:outputs` (PASS); `node --test
scripts/checks/check-repository-layout.test.mjs scripts/checks/check-tracked-outputs.test.mjs` (11/11);
confirm `generatedDirectorySegment` / `GENERATED_DIRECTORY_SEGMENTS` are defined only in
`scripts/checks/repository-files.mjs` and imported by both checks; `npm run check:scripts-dedup` (PASS).
