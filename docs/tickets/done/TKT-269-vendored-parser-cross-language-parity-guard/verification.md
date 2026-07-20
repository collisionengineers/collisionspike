# Verification — TKT-269: Guard independently duplicated parser and domain rules

## Verdict

PASS — 2026-07-20.

## Evidence

- **A1.** `packages/domain/src/domain/parser-parity.test.ts` compares Python and TS VRM canonicalisation
  and Case/PO-marker recognition on the shared `scripts/checks/parser-domain-parity-vectors.json` corpus,
  naming the exact callable on each side (`normalize_vrm`/`case_type_for_reference` vs
  `canonicalizeVrm`/`markerToCaseType(parseCasePoMarker(...))`).
- **A2.** The guard pins observable outputs, not implementation. The known VRM special-case divergence (D1)
  and the separator (D2) and marker-guard (D3/D4) divergences are recorded as explicitly-approved
  `allowedDivergence` vectors and documented in `scripts/checks/parser-domain-parity.md`.
- **A3.** One-sided divergences are caught: the "each allowed divergence is a REAL one-sided difference"
  test asserts the two columns differ for every declared VRM and marker divergence, and the pinned-column
  assertions fail if either side changes without a corpus edit. Adjacent agreement sentinels (e.g.
  `audit`/`unmarked`, `spaced-lower`) break if a rule flips.
- **A4.** The ADR-0018 `*_vendored_in_sync` guards and vendor-lock are unchanged; the parity guard runs
  under `verify-all.mjs` via the `@cs/domain` vitest suite (`npm test`), no `verify-all.mjs` edit needed.
- **A5.** EVA coverage stays the existing schema/rename in-sync guards; no tautological comparison against
  `buildEvaPayload`/`decideCaseType` (they project already-normalised values).
- **A6.** No live write.

## Commands

- `python scripts/checks/parser_parity_emitter.py --vectors scripts/checks/parser-domain-parity-vectors.json`
  → emits the pinned Python columns.
- `npm run test --workspace @cs/domain` → 32 files / 598 tests pass, including the 4 parser-parity tests.

## Pending / gaps

None. Whether to reconcile any of D1–D4 (change one implementation) or keep the allowance is a future
decision; the corpus is the contract either way.

## How to re-verify

`npm run test --workspace @cs/domain` from a clean checkout (Python on PATH or `CS_PYTHON` set); flip a
pinned column in the corpus and confirm the guard fails.
