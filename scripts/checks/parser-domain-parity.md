# Cross-language parity (TKT-269 / PLAN-011, widened by TKT-277 / PLAN-012)

The Python function services and browser-safe `@cs/domain` (and the orchestration triage policy) each
independently implement rules that also live on the other side. They are deliberately kept as separate
implementations (ADR-0032 — Python services stay independently packaged; ADR-0018 — the parser stays
vendored and drift-locked), so a behavioural **parity guard** on a shared corpus replaces a shared module.

## The seams

| Concern | Python | TypeScript |
| --- | --- | --- |
| VRM canonicalisation | `normalize_vrm` — `parser cedocumentmapper_v2/normalization/normalizers.py` | `canonicalizeVrm` — `packages/domain/src/domain/vrm-canon.ts` |
| Case/PO marker → case type | `case_type_for_reference` — `parser cedocumentmapper_v2/detection/case_type.py` | `markerToCaseType(parseCasePoMarker(...).marker)` — `packages/domain/src/domain/retro-case.ts` |
| VRM enrichment canonicaliser (C2) | `canonicalize_registration` — `vehicle-enrichment vehicle_data/registration.py` | `canonicalizeVrm` — `packages/domain/src/domain/vrm-canon.ts` |
| Evidence-kind MIME classifier (C3) | `classify_evidence_kind` — `box-webhook evidence_kind.py` | `classifyAttachment` — `packages/domain/src/domain/classification.ts` |
| Case/PO token shape (C5) | `CASEREF_RE` (whole-token) — `parser …/rules/email_classifier.py` | `CASE_PO_SHAPE_RE` — `packages/domain/src/domain/retro-case.ts` |
| Delivered-images-only predicate (C1) | `_delivered_images_only` — `parser …/rules/email_classifier.py` | `deliveredImagesOnly` — `services/orchestration/src/workflows/intake/triagePolicy.ts` |
| EVA 12-field format validation (C4) | `validate_core_payload` — `eva-sentry payload.py` | `contracts/eva-payload.schema.json` (the schema itself) |

Python's `case_type_for_reference` returns `None` for an unmarked/guarded reference; that is written in its
normalised form `"standard"` (the TS `markerToCaseType` default) in the corpus so both columns are case
types.

## How it runs

- **Corpus:** `scripts/checks/parser-domain-parity-vectors.json` — one shared JSON both languages read.
  Each vector pins BOTH columns; a legitimate current difference carries distinct columns plus an
  `allowedDivergence` reason.
- **Guard:** `packages/domain/src/domain/parser-parity.test.ts` (vitest, node env) imports the TS callables
  from source and `spawnSync`s `scripts/checks/parser_parity_emitter.py` (which runs the same corpus
  through the parser's own callables, import-light — no parser venv needed). It asserts each side matches
  its pinned column and that the two agree on every non-divergent vector. Interpreter discovery mirrors the
  forbidden-signature parity harness (`CS_PYTHON`, else `python`/`python3`). It runs under
  `node verify-all.mjs` via `npm test` → the `@cs/domain` suite, with no `verify-all.mjs` edit.

## Known, currently-unreconciled divergences (encoded as allowed vectors)

- **D1 — OCR extra digit (VRM):** `normalize_vrm` strips an intrusive `1` in the `LL1DDLLL` shape
  (`YT113UTV → YT13UTV`); `canonicalizeVrm` has no such special-case (`YT113UTV` unchanged).
- **D2 — separator breadth (VRM):** Python strips only whitespace (`YT13-UTV → YT13-UTV`); TS strips all
  `[^A-Z0-9]` (`YT13-UTV → YT13UTV`).
- **D3 — marker followed by a non-alphabetic char:** Python's marker regex requires a trailing letter
  (guards `A.4` numeric noise → no marker → `standard`); TS matches the marker prefix regardless
  (`A.4 → audit`).
- **D4 — bare marker, no body:** `A.`/`AP.`/`D.` → Python no marker (`standard`); TS prefix match yields
  the case type.
- **D5/D6 — delivered-images-only kind vocabulary (C1):** Python accepts any kind in
  `{image,images,photo,photos}` and has a kinds-only branch (no filenames); the TS predicate accepts only
  the literal `image` kind and returns `false` when no non-signature filename is supplied. Both agree on
  the live inputs (`attachmentKindsOf` only ever emits `image`).

**C2, C3, C5 carry no divergences** — the vehicle-enrichment canonicaliser matches `canonicalizeVrm`, the
Case/PO token shapes agree as whole-token validators, and **C3 was reconciled** (TKT-277): `classifyAttachment`
was widened to the `image/*` MIME wildcard so it matches `classify_evidence_kind` and the TKT-124 re-kind
migration (an honest `image/*` beats a missing extension-table entry). The C1 seam runs in the orchestration
suite (`triage-parity.test.ts`); C4 runs in the eva-sentry pytest (`test_schema_parity.py`).

These are recorded as **allowed** divergences, not defects. Whether to reconcile a pair (change one
implementation) or keep the allowance is a future decision; either way the corpus is the contract.

## Change protocol

Any behavioural change to one side (an edit to `normalize_vrm` in
`services/engine/cedocumentmapper_v2/`, or an edit to `canonicalizeVrm`/the marker parser) MUST update
that side's column in the corpus in the **same change**, keeping the vectors green. Reconciling a
divergence means updating both columns to agree and removing its `allowedDivergence`. This guard pins
behaviour only; it does not touch `scripts/checks/check-engine-materialized.py` (which pins the
materialized parser/OCR copies to the canonical engine source, not TS/Python behaviour) or the EVA
schema/rename in-sync guards, which remain authoritative for their own boundaries.
