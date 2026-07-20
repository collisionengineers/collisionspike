# Verification — TKT-277: Widen cross-language parity + reconcile the evidence-kind MIME divergence

## Verdict

PASS

## Evidence

- **C1** — `services/orchestration/src/workflows/intake/triage-parity.test.ts` (4 tests) pins
  `deliveredImagesOnly` ↔ `_delivered_images_only` on shared fixtures; D5/D6 record the kinds-only /
  vocabulary divergence and fail closed if a side is reconciled without a corpus edit.
- **C2** — the `vrmEnrichment` seam in `parser-parity.test.ts` pins `canonicalize_registration` ↔
  `canonicalizeVrm` (all agree).
- **C3** — `classifyAttachment` widened to the `image/*` wildcard; the `evidenceKind` seam pins it against
  `classify_evidence_kind` (all agree — `image/tiff|heic|webp` now classify as `image` on both sides). The
  box-webhook docstring is corrected.
- **C4** — `services/functions/eva-sentry/tests/test_schema_parity.py` (6 tests) asserts
  `validate_core_payload`'s patterns/enums/oneOf/minLength match `contracts/eva-payload.schema.json`.
- **C5** — the `casePoToken` seam pins `CASEREF_RE` (whole-token) ↔ `CASE_PO_SHAPE_RE` (all agree).
- **Guards run under verify-all** and fail closed on one-sided edits. The existing engine/schema in-sync
  and VRM/Case-PO parity guards still pass (`check:parity` 4/4).
- **No regression.** `check:runtime-contract` byte-identical (191/56/7/65/22). Suites: `@cs/domain` 598,
  `@cs/orchestration` 585, `@cs/api` 1107, box-webhook 294, eva-sentry 51 — all green.
  `check:auth-inventory`, `check:docs`, `check:guard-register`, line-endings all pass. No live write.

## Commands

```
npm run check:parity
npm run test --workspace @cs/orchestration -- run triage-parity
(cd services/functions/eva-sentry && python -m pytest tests/test_schema_parity.py -q)
node scripts/checks/check-runtime-contract.mjs
```

## Pending / gaps

None.
