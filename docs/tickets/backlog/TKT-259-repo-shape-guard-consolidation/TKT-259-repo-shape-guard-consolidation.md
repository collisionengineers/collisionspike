---
id: TKT-259
title: Consolidate repo-shape file-enumeration and the generated-directory set
status: backlog
priority: P3
area: platform
tickets-it-relates-to: [TKT-207, TKT-214, TKT-258, TKT-261]
research-link: docs/tickets/backlog/TKT-259-repo-shape-guard-consolidation/evidence/distillation-note.md
plan: PLAN-010
---

# Consolidate repo-shape file-enumeration and the generated-directory set

## Problem
Two repo-shape checks re-declare overlapping "what may be tracked where" logic: `check-repository-layout.mjs`
carries its own file-enumeration instead of the shared helper, and it and `check-tracked-outputs.mjs` each
hard-code a generated-directory set and apply different case-normalisation rules — a classic
silent-divergence surface.

## Evidence
Verified read-only 2026-07-19: `scripts/checks/repository-files.mjs` is the shared file-enumeration helper
(`listRepositoryFiles`, `normalizeRepositoryPath`), already imported by `check-tracked-outputs.mjs` and the
inventory generators, but `check-repository-layout.mjs` uses its own `trackedPaths()` instead. The two
generated-directory sets overlap but differ (layout has `.artifacts`; tracked-outputs has
`.mypy_cache`/`.ruff_cache`/`.venv`/`.vite`). Tracked outputs case-folds the path before matching; layout
matches raw segments case-sensitively. `check-repository-data-authority.mjs` is a content/prose scanner and
`repository-hygiene.mjs` is a git/worktree hygiene report — different concerns, out of scope.

## Proposed change
Point `check-repository-layout.mjs` at the shared `listRepositoryFiles`, and extract one generated-directory
predicate that normalises separators, case-folds segments, and consults one shared set. Both checks consume the
predicate. Keep both as separate CLI entry points (CI invokes them individually). Do not touch the
data-authority or hygiene checks.

## Acceptance
- **A1.** `check-repository-layout.mjs` uses the shared `listRepositoryFiles` enumerator, not a local
  `trackedPaths()`.
- **A2.** The generated-directory set and the separator-normalising, case-folding segment predicate are each
  defined once and imported by both checks; the previously drifted entries are reconciled into that policy.
- **A3.** `check-repository-data-authority.mjs` and `repository-hygiene.mjs` are unchanged (explicitly out of
  scope).
- **A4.** Tests prove both checks reject representative mixed-case and backslash paths (for example `.VENV`)
  through the same predicate.
- **A5.** Both checks remain independently invocable CLI entry points; `check:layout` and `check:outputs`
  retain their current-tree verdicts.
- **A6.** The implementation records before/after owned-file and nonblank-line deltas for PLAN-010 close-out.
- **A7.** No live write.

## Validation
- Run `check:layout` and `check:outputs` before and after (same verdicts on the current tree); run mixed-case
  and separator-normalisation tests; confirm the predicate and set are each defined once; report the
  structural delta; full `node verify-all.mjs`.

## Research
Distilled from `workingspace/architecture-simplification/04-scripts-and-tooling-dedup.md` item 2 and narrowed
by direct inspection of the four named checks on 2026-07-19 to the layout ↔ tracked-outputs pair;
data-authority and hygiene are different concerns. Gated on full PLAN-006 close-out.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
