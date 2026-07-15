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
