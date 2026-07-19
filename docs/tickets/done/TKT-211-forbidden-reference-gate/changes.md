# Changes — TKT-211: Enforce the forbidden-reference zero state

## Status
verify — retired implementation remnants are removed from the checked-out tree and all purge gates
pass offline; final clean-checkout and independent review remain pending.

## Commits
- 70a3bb57 — preserve the initial scan boundary before mutation.

## Files touched
- scripts/checks/check-forbidden-references.mjs
- scripts/checks/forbidden-signatures.json
- scripts/checks/check-binary-content.py
- scripts/checks/check-image-review.mjs
- tests/fixtures/manifests/image-review.json
- Current source, documentation, ticket and agent artifacts identified by the baseline scan

## Summary
The staged final tree has deterministic strict path/text, expanded vocabulary, extracted-binary and reviewed-image
gates. The image manifest records a per-hash visual review for all 294 retained image blobs, including OCR
for 136 text-bearing images. Retired adapters, aliases, connector artifacts, identifiers, metadata and
explanatory narratives were removed without changing current numeric codes or the parser's generic defensive
decoding.

## Close-out documentation (verification only, no tree change)
Resolved the Stage-1 independent-verification finding that A3/A4/A6/A7 could not be confirmed from the tree
alone: `verification.md` now carries a per-criterion evidence block pointing at the authoritative sources —
the forbidden-signature corpus (`scripts/checks/forbidden-signatures.json`, 35 signatures), the
`check:forbidden --json` counts (2,957 scanned, 0 matched), the cited exclusion list
(`scripts/checks/check-forbidden-references.mjs` lines 148–160) with a reason per prefix, the TKT-207
disposition ledger rows (`docs/governance/repository-reconciliation.json` — delete 1,277 / keep 1,107 /
move 955 / rewrite 705, unexplained 0; 431 TKT-213 ticket-link rewrites; no `archive/` top-level folder),
and the non-retained-evidence inventory (`tests/fixtures/manifests/evidence-dispositions.json`, 94 logical
occurrences). No gate was changed and no repository content was mutated; this is documentation of an
already-satisfied state.
