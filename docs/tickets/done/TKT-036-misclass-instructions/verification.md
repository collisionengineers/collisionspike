# Verification — TKT-036: Work-instructions email misclassified as query

## Verdict
VERIFIED-LIVE (2026-07-02) — live-probed against the deployed engine; locked by an eval-corpus regression pin

## Evidence
- Live probe: the deployed `/classify-email` route (`cespike-parser-dev`) classifies `Our Ref 206848.001 -
  Kassar Saeed - New eng ins.eml` as `receiving_work`/`new_client_work` (instructions / work-to-do, not a
  query) — per the rules-engine-v2 plan's own evidence base,
  [rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](TKT-036-misclass-instructions.md).
- Regression pin: manifest item `tkt036-instructions-misclass` in the committed real-email eval harness —
  `category_correct`/`subtype_correct` both `true` at confidence `0.8` in the checked-in
  [baseline-v2.json](../../../../scripts/evaluation/email/baseline-v2.json) (v2-taxonomy aggregate 84.1%, up from
  the v1 baseline 77.3% — [README](../../../../scripts/evaluation/email/README.md)).

## Pending / gaps
Flagged **verified-by-eval but fragile until Phase 2** by the plan's own evidence base: today's correct
result comes from the existing text-signal rules, not yet from a context-aware policy — see
[docs/tickets/BOARD.md](../../BOARD.md) §D6/D7 for the `TRIAGE_*` gates that harden it (currently OFF). No fresh
real-world re-occurrence has been observed since — the probe replayed the original evidence file.

## How to re-verify
`python scripts/evaluation/email/run_eval.py --check scripts/evaluation/email/baseline-v2.json`
(regression gate), or re-POST `evidence/Our Ref 206848.001 - Kassar Saeed - New eng ins.eml` to the
deployed `/classify-email` route directly.
