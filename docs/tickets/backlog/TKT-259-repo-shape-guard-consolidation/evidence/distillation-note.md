# Distillation note — TKT-259

**Source:** `04-scripts-and-tooling-dedup.md` item 2. **Plan:** PLAN-010. Re-verified read-only 2026-07-19
(`PLAN-010.dossier.json`).

**What is actually shared vs duplicated:**
- `scripts/checks/repository-files.mjs` = the shared enumerator (`listRepositoryFiles`, `comparePaths`,
  `normalizeRepositoryPath`), already imported by `check-tracked-outputs.mjs`, `generate-repository-inventory.mjs`,
  `reconcile-repository-reset.mjs`.
- `check-repository-layout.mjs` hard-codes its own `trackedPaths()` (does not use the enumerator) + its own
  generated-directory set.
- `check-tracked-outputs.mjs` hard-codes its own generated-directory set. The two sets drift: layout uniquely
  has `.artifacts`; tracked-outputs uniquely has `.mypy_cache` / `.ruff_cache` / `.venv` / `.vite`; ~6 overlap.

**Merge target:** (a) layout → `listRepositoryFiles`; (b) one shared generated-directory constant. That is the
whole real consolidation.

**Explicitly excluded (different concerns):** `check-repository-data-authority.mjs` (regex content/prose
scanner) and `scripts/repository-hygiene.mjs` (git branch/worktree/PR hygiene report). Keep CLI entry points —
CI invokes checks individually.
