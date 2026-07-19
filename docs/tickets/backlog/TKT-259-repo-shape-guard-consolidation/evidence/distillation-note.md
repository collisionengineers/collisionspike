# Distillation note — TKT-259

**Source:** `workingspace/architecture-simplification/04-scripts-and-tooling-dedup.md` item 2.
**Plan:** PLAN-010. Re-verified directly against the named repository checks on 2026-07-19.

**What is actually shared vs duplicated:**
- `scripts/checks/repository-files.mjs` = the shared enumerator (`listRepositoryFiles`, `comparePaths`,
  `normalizeRepositoryPath`), already imported by `check-tracked-outputs.mjs`, `generate-repository-inventory.mjs`,
  `reconcile-repository-reset.mjs`.
- `check-repository-layout.mjs` hard-codes its own `trackedPaths()` (does not use the enumerator) + its own
  generated-directory set.
- `check-tracked-outputs.mjs` hard-codes its own generated-directory set. The two sets drift: layout uniquely
  has `.artifacts`; tracked-outputs uniquely has `.mypy_cache` / `.ruff_cache` / `.venv` / `.vite`; ~6 overlap.
- The match semantics also drift: tracked outputs lowercases paths before segment matching, while layout
  performs a case-sensitive raw-segment lookup.

**Merge target:** (a) layout → `listRepositoryFiles`; (b) one shared generated-directory set; and (c) one
separator-normalising, case-folding segment predicate consumed by both checks. That is the whole real
consolidation.

**Explicitly excluded (different concerns):** `check-repository-data-authority.mjs` (regex content/prose
scanner) and `scripts/repository-hygiene.mjs` (git branch/worktree/PR hygiene report). Keep CLI entry points —
CI invokes checks individually.
