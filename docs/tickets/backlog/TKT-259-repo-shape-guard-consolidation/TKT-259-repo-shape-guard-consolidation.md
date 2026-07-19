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
hard-code a set of generated directories that has already drifted apart — a classic silent-divergence surface.

## Evidence
Verified read-only 2026-07-19: `scripts/checks/repository-files.mjs` is the shared file-enumeration helper
(`listRepositoryFiles`, `normalizeRepositoryPath`), already imported by `check-tracked-outputs.mjs` and the
inventory generators, but `check-repository-layout.mjs` uses its own `trackedPaths()` instead. The two
generated-directory sets overlap but differ (layout has `.artifacts`; tracked-outputs has
`.mypy_cache`/`.ruff_cache`/`.venv`/`.vite`). `check-repository-data-authority.mjs` is a content/prose scanner
and `repository-hygiene.mjs` is a git/worktree hygiene report — different concerns, out of scope.

## Proposed change
Point `check-repository-layout.mjs` at the shared `listRepositoryFiles`, and make the generated-directory set a
single shared constant consumed by both `check-repository-layout.mjs` and `check-tracked-outputs.mjs`. Keep
both as separate CLI entry points (CI invokes them individually). Do not touch the data-authority or hygiene
checks.

## Acceptance
- **A1.** `check-repository-layout.mjs` uses the shared `listRepositoryFiles` enumerator, not a local
  `trackedPaths()`.
- **A2.** The generated-directory set is defined once and imported by both `check-repository-layout.mjs` and
  `check-tracked-outputs.mjs`; the previously-drifted entries are reconciled into that single set.
- **A3.** `check-repository-data-authority.mjs` and `repository-hygiene.mjs` are unchanged (explicitly out of
  scope).
- **A4.** Both checks remain independently invocable CLI entry points; `check:layout` and `check:outputs`
  behave identically to before on the current tree.
- **A5.** No live write.

## Validation
- Run `check:layout` and `check:outputs` before and after (same verdicts on the current tree); confirm the
  single generated-directory constant is the only definition; full `node verify-all.mjs`.

## Research
Distilled from `04-scripts-and-tooling-dedup.md` item 2, narrowed after read-only verification on 2026-07-19
(`PLAN-010.dossier`) to the layout ↔ tracked-outputs pair; data-authority and hygiene excluded as different
concerns. Gated on full PLAN-006 close-out.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
