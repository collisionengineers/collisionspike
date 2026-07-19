# Changes — TKT-207: Build the complete repository inventory and disposition ledger

## Status
verify — all acceptance items implemented and verified. The deterministic baseline, current-tree
inventory and disposition records are in place; per-disposition-class / per-final-state sampling (A6, A7)
is verified against Git ground truth; and A5's human-readable current-vs-proposed tree is now generated
and gated (see below).

## Commits
- 70a3bb57 — immutable programme baseline and pre-mutation inventory boundary.

## Files touched
- docs/governance/repository-inventory.json
- docs/governance/repository-map.md
- scripts/maintenance/generate-repository-inventory.mjs
- tests/fixtures/manifests/evidence-dispositions.json
- scripts/maintenance/generate-repository-tree.mjs (A5 — new generator)
- docs/governance/repository-tree.md (A5 — new generated artifact)
- package.json, verify-all.mjs, docs/governance/README.md (A5 wiring: generate:tree / check:tree + CI + link)

## Summary
The repository now has a deterministic, path-sorted inventory with media type, size, SHA-256, category,
owner and lifecycle fields. Its documented null self-hash avoids an impossible recursive digest. The
pre-change audit is preserved by the baseline commit; the retained current tree and all deliberate
non-retention decisions are machine-readable.

Close-out addition: `verification.md` now records independent per-disposition-class (keep/move/rewrite/
delete) and per-final-state (retained/moved/rewritten/created/regenerated) sampling. Each sample was
checked against raw Git object bytes — blob-OID equality for keeps and moves, OID divergence for
rewrites, index-absence for deletes — rather than against the ledger's own self-check, and the four
immutable `workingspace/*` moves are proven by blob-OID equality plus the locked physical-byte SHA-256.

A5 close-out: `scripts/maintenance/generate-repository-tree.mjs` renders `docs/governance/repository-tree.md`
(the current and proposed trees with per-area and total counts) from `repository-reconciliation.json`,
asserting the counts reconcile to `summary.baseline` / `summary.final` and to the inventory. `check:tree`
gates it in `verify-all.mjs` and CI, and it converges idempotently inside `generate:governance`.
