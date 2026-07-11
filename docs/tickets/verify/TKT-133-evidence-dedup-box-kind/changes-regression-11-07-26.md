# Regression follow-up — 11 July 2026

## Why this ticket reopened

PR 55's internal evidence writer enforced the `(case_id, sha256)` twin contract, but the case-merge route bulk-reparented every source row. When both cases already held the same bytes, the survivor could therefore gain duplicate active photos, duplicating EVA ordering and readiness/chase counts.

## Required correction

- Lock both evidence sets inside the merge transaction.
- Coalesce missing Blob/Archive provenance onto the survivor's existing SHA row.
- Move only non-colliding rows; retain any redundant source row on the retired case rather than creating a second active survivor row.
- Keep null or invalid SHA rows on the existing merge path.

## Verification target

- Merging two cases with the same SHA leaves one active survivor photo.
- Complementary provenance is preserved on that survivor row.
- Different hashes and rows without a usable SHA still move normally.

## Implementation

- Merge locks both evidence sets, canonicalises valid SHA-256 values, keeps one deterministic target
  survivor, and coalesces missing Blob/Archive and review provenance onto it.
- Only non-colliding rows move; redundant source twins remain attached to the retired case because the
  staff database role cannot delete them. Source-only twins are collapsed before the one survivor moves.
- Invalid or absent hashes retain the original move behaviour (`057f7a0`).
- Pending Archive work now follows a moved evidence row to the survivor. A SHA collision completes
  redundant source work and requests a copy for the eligible survivor, so dedup cannot silently lose
  the only outstanding Archive request (`070a0bf`).
