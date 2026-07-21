# Verification — TKT-293: Parse-fed backtest harness — the go/no-go gate (PLAN-014 Slice 3)

## Verdict
TESTED-OFFLINE

## Evidence

- **The go/no-go result itself**: `python scripts/evaluation/email/run_ab_parsefed.py` against
  the full 58 loadable tracked corpus items (of 67 total; 9 not locally resolvable in this
  environment, a pre-existing evidence-store condition unrelated to this change) —
  **0 regressions, 2 improvements**, category+subtype exact accuracy 87.9% → 91.4%. Full
  report: `evidence/parsefed-backtest-report.md`.
- `scripts/evaluation/email`: `python -m pytest tests/ -q` — 5 passed (2 pre-existing
  `test_model_matrix.py`, 3 new).
- `services/functions/parser`: `python -m pytest -q` — 400 passed, 19 skipped.
- `packages/domain`: `npx vitest run src/domain/triage-policy` — 56 passed (incl. the new
  ADR-0010 pin).

## Pending / gaps

- Corpus expansion (ambiguous/none `open_case_ref_match`, photos-in-a-PDF with a generic
  filename) is NOT closed — needs real operator-supplied samples via
  `scripts/evaluation/email/local/eval-overlay.json`. Recorded as an explicit fast-follow,
  not silently dropped.
- 9 of 67 manifest items did not resolve locally in this environment (skipped, not scored) —
  this is the evidence-store resolution mechanism's own behavior (`resolve_manifest_file`),
  unrelated to this ticket; re-verify with a full evidence-store checkout if a different
  number needs explaining.

## How to re-verify

- `python scripts/evaluation/email/run_ab_parsefed.py` — expect 0 regressions.
- `python -m pytest scripts/evaluation/email/tests/ -q` — expect 5 passed.
- `cd services/functions/parser && python -m pytest -q` — expect 400 passed / 19 skipped.
- `cd packages/domain && npx vitest run src/domain/triage-policy` — expect 56 passed.
