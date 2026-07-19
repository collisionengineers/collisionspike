# Distillation note — TKT-258

**Source:** `04-scripts-and-tooling-dedup.md` item 1. **Plan:** PLAN-010. Re-verified read-only 2026-07-19
(`PLAN-010.dossier.json`).

**Two hash/walk cores (not three):**
- `scripts/maintenance/generate-repository-inventory.mjs` — hashes the **Git index** (`git ls-files
  --cached --stage` + `git cat-file --batch`), own `sha256File`, no FS walk.
- `scripts/maintenance/generate-checkout-inventory.mjs` — real recursive **filesystem** walk + its own
  `sha256File` (the genuine second core).
- `scripts/maintenance/reconcile-repository-reset.mjs` — **NOT** a third: imports `readGitBlobMetadata` from
  the inventory generator and does `git ls-tree` prefix-move reconciliation. No `sha256File`, no FS walk.

**Shareable surface:** only `sha256File` + path-normalisation. **Do NOT merge** the three classification maps
(`categoryFor`/`ownerFor`/`lifecycleFor` vs the `baseline*` variants) — they encode intentionally different
layouts (pre-reset `api/`, `mockup-app/`, `docs/workingspace/` vs current `services/…`, `apps/web/`).

**Highest risk:** ledger output drift. Acceptance = byte-identical `repository-inventory.json` + reconciliation
ledger. Gated on full PLAN-006 close-out (TKT-207/209/214 own these scripts; TKT-210 still in `now`).
