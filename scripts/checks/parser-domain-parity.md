# Parser ↔ `@cs/domain` cross-language parity (TKT-269 / PLAN-011)

The vendored parser and browser-safe `@cs/domain` each independently implement VRM canonicalisation and
Case/PO-marker recognition. They are deliberately kept as two implementations (ADR-0032 — Python services
stay independently packaged; ADR-0018 — the parser stays vendored and drift-locked), so a behavioural
**parity guard** replaces a shared module.

## The two seams

| Concern | Python (vendored parser) | TypeScript (`@cs/domain`) |
| --- | --- | --- |
| VRM canonicalisation | `normalize_vrm` — `cedocumentmapper_v2/normalization/normalizers.py` | `canonicalizeVrm` — `packages/domain/src/domain/vrm-canon.ts` |
| Case/PO marker → case type | `case_type_for_reference` (via `marker_for_reference`) — `cedocumentmapper_v2/detection/case_type.py` | `markerToCaseType(parseCasePoMarker(...).marker)` — `packages/domain/src/domain/retro-case.ts` |

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

These are recorded as **allowed** divergences, not defects. Whether to reconcile a pair (change one
implementation) or keep the allowance is a future decision; either way the corpus is the contract.

## Change protocol

Any behavioural change to one side (a re-vendor that changes `normalize_vrm`, or an edit to
`canonicalizeVrm`/the marker parser) MUST update that side's column in the corpus in the **same change**,
keeping the vectors green. Reconciling a divergence means updating both columns to agree and removing its
`allowedDivergence`. This guard pins behaviour only; it does not touch the ADR-0018 vendor-lock files
(`VENDOR_LOCK.json`, `PROVENANCE.md`, `verify_vendor_pin.py`, `test_engine_vendored_in_sync.py`) or the
EVA schema/rename in-sync guards, which remain authoritative for their own boundaries.
