# Changes — TKT-207: Build the complete repository inventory and disposition ledger

## Status
verify — deterministic baseline, current-tree inventory and disposition records are implemented; final
inventory regeneration follows the remaining close-out edits.

## Commits
- 70a3bb57 — immutable programme baseline and pre-mutation inventory boundary.

## Files touched
- docs/governance/repository-inventory.json
- docs/governance/repository-map.md
- scripts/maintenance/generate-repository-inventory.mjs
- tests/fixtures/manifests/evidence-dispositions.json

## Summary
The repository now has a deterministic, path-sorted inventory with media type, size, SHA-256, category,
owner and lifecycle fields. Its documented null self-hash avoids an impossible recursive digest. The
pre-change audit is preserved by the baseline commit; the retained current tree and all deliberate
non-retention decisions are machine-readable.
