# Distillation note — TKT-258

**Source:** `workingspace/architecture-simplification/04-scripts-and-tooling-dedup.md` item 1.
**Plan:** PLAN-010. Re-verified directly against the named repository files on 2026-07-19.

**Two hash/walk cores (not three):**
- `scripts/maintenance/generate-repository-inventory.mjs` — hashes ordinary **Git-index blobs** incrementally
  inside `readGitBlobMetadata` (`git cat-file --batch`), with separate local file and direct-byte hash paths.
- `scripts/maintenance/generate-checkout-inventory.mjs` — real recursive **filesystem** walk + its own
  `sha256File`, direct-byte hash path, and path normaliser (the genuine second core).
- `scripts/maintenance/reconcile-repository-reset.mjs` — **NOT** a third: imports `readGitBlobMetadata` from
  the inventory generator and does `git ls-tree` prefix-move reconciliation. No `sha256File`, no FS walk.

**Shareable surface:** an incremental SHA-256 primitive plus byte/file helpers, and the existing shared
`normalizeRepositoryPath`. Moving only `sha256File` would leave the main index-blob hash local. **Do NOT
merge** the three classification-policy groups — they encode intentionally different pre-reset, current
tracked-tree, and physical-checkout views.

**Highest risk:** ledger output drift. Acceptance = byte-identical `repository-inventory.json` + reconciliation
ledger. Gated on full PLAN-006 close-out (TKT-207/209/214 own these scripts; TKT-210 still in `now`).
