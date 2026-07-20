# Changes — TKT-269: Guard independently duplicated parser and domain rules

## Status

Implemented 2026-07-20 on branch `plan011/tkt-267-269-doctrine-parity`. Test-only guard; no production
code changed; no live write.

## What changed

A cross-language **behavioural** parity guard now compares the two independent implementations of VRM
canonicalisation and Case/PO-marker recognition on one shared fixture corpus:

- Python `normalize_vrm` (`cedocumentmapper_v2/normalization/normalizers.py`) vs TS `canonicalizeVrm`
  (`packages/domain/src/domain/vrm-canon.ts`).
- Python `case_type_for_reference` / `marker_for_reference`
  (`cedocumentmapper_v2/detection/case_type.py`) vs TS `markerToCaseType(parseCasePoMarker(...).marker)`
  (`packages/domain/src/domain/retro-case.ts`).

### Added

- `scripts/checks/parser-domain-parity-vectors.json` — the shared corpus. Agreement sentinels plus the
  four currently-unreconciled divergences encoded as explicit `allowedDivergence` vectors: D1 (OCR
  extra-digit VRM special-case), D2 (separator breadth), D3 (marker-then-non-alpha guard), D4 (bare marker).
- `scripts/checks/parser_parity_emitter.py` — an import-light emitter (stdlib + the two pure parser
  modules; no parser venv) that runs the corpus through the parser's callables and prints JSON.
- `packages/domain/src/domain/parser-parity.test.ts` — the vitest guard: imports the TS callables from
  source, `spawnSync`s the emitter (interpreter discovery mirrors the forbidden-signature harness:
  `CS_PYTHON` else `python`/`python3`), and asserts each side reproduces its pinned column, the two agree
  on every non-divergent vector, and each declared divergence is a real one-sided difference (fails closed
  if a side is reconciled without a corpus edit).
- `scripts/checks/parser-domain-parity.md` — the contract note (the two seams, the run mechanism, D1–D4,
  and the change protocol).

## Invariants preserved

- The ADR-0018 vendor-lock (`VENDOR_LOCK.json`, `PROVENANCE.md`, `verify_vendor_pin.py`,
  `test_engine_vendored_in_sync.py`) and the EVA schema/rename in-sync guards are untouched — the guard
  pins behaviour on fixtures alongside them.
- No EVA-normalisation comparison is invented: `buildEvaPayload` and `decideCaseType` project
  already-normalised values and are not independent Python-normalizer counterparts (A5).
- No `verify-all.mjs` edit is needed — the guard runs under the `@cs/domain` vitest suite that
  `verify-all.mjs` already invokes via `npm test`.
