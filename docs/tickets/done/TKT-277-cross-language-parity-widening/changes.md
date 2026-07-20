# Changes — TKT-277: Widen cross-language parity + reconcile the evidence-kind MIME divergence

## C3 — reconcile the evidence-kind MIME fallback (the one active divergence)

- `packages/domain/src/domain/classification.ts`: `classifyAttachment` now treats any `image/*` MIME as
  `image` when the extension is absent/unknown (previously only the explicit `{jpeg,jpg,png}` table). This
  matches box-webhook `classify_evidence_kind` and the TKT-124 re-kind migration ("an honest `image/*`
  beats a missing table entry", e.g. `.tiff`/`.heic` scans). The data-api internal route's `|| mimeIsImage`
  compensation is now redundant (left in place, behaviour-unchanged).
- `services/functions/box-webhook/evidence_kind.py`: corrected the "mirrors EXACTLY" docstring — the two
  now genuinely agree and are pinned by the parity corpus.

## New / widened parity guards

- **Emitter** `scripts/checks/parser_parity_emitter.py` now also imports (import-light) and emits the
  vehicle-enrichment, box-webhook, and parser callables: `canonicalize_registration` (C2),
  `classify_evidence_kind` (C3), `CASEREF_RE` whole-token match (C5), and `_delivered_images_only` (C1).
- **Corpus** `scripts/checks/parser-domain-parity-vectors.json` gains `vrmEnrichmentVectors` (C2),
  `evidenceKindVectors` (C3), `casePoTokenVectors` (C5), and `deliveredImagesOnlyVectors` (C1). C2/C3/C5
  agree on every vector; C1 records D5/D6 (Python's kinds-only branch + broader kind vocabulary).
- **Domain guard** `packages/domain/src/domain/parser-parity.test.ts` is generalised over seams and now
  pins C2 (`canonicalizeVrm`), C3 (`classifyAttachment`), and C5 (`CASE_PO_SHAPE_RE`).
- **C1** `services/orchestration/src/workflows/intake/triage-parity.test.ts` (new) pins
  `deliveredImagesOnly` ↔ `_delivered_images_only`; `deliveredImagesOnly` is now exported.
- **C4** `services/functions/eva-sentry/tests/test_schema_parity.py` (new) asserts
  `validate_core_payload`'s format constants (`_DATE_RE`, `_MILEAGE_RE`, `_ADDRESS_SIX_LINES_RE`,
  `_VAT_ENUM`, `_MILEAGE_UNIT_ENUM`, `_REQUIRED_NONEMPTY`) match the schema's patterns/enums/oneOf/minLength.
- `scripts/checks/parser-domain-parity.md` documents all seams, the C3 reconciliation, and D5/D6.

## Guards run under verify-all

The domain seams run via `check:parity` / `npm test`; the C1 orchestration seam via the orchestration
vitest suite; C4 via the eva-sentry pytest suite — all under `verify-all.mjs`. Each guard fails closed on a
one-sided edit (pinned-column + agreement assertions). This widens parity **coverage** (additive guards),
so the net-negative consolidation discipline does not apply. `check:runtime-contract` byte-identical. No
live write.
