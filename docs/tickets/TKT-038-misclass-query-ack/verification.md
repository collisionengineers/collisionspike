# Verification — TKT-038: Bare acknowledgement ('Thanks Ed') misclassified as query

## Verdict
VERIFIED-LIVE (2026-07-02) — live-probed against the deployed engine; locked by an eval-corpus regression pin

## Evidence
- Live probe: the deployed `/classify-email` route (`cespike-parser-dev`) classifies the "Thanks Ed" reply
  as `non_actionable`/`acknowledgement` (not a query) — per the rules-engine-v2 plan's own evidence base,
  [rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](../../plans/rules_engine_v2_plan_9ba034c4.plan.md).
- Regression pin: manifest item `tkt038-bare-ack` in the committed real-email eval harness —
  `category_correct`/`subtype_correct` both `true` at confidence `0.6` in the checked-in
  [baseline-v2.json](../../../scripts/eval-email/baseline-v2.json) (v2-taxonomy aggregate 84.1%, up from
  the v1 baseline 77.3% — [README](../../../scripts/eval-email/README.md)).

## Pending / gaps
Flagged **verified-by-eval but fragile until Phase 2** by the plan's own evidence base: today's correct
result comes from the existing text-signal rules, not yet from a context-aware policy — see
[docs/gated.md](../../gated.md) §D6/D7 for the `TRIAGE_*` gates that harden it (currently OFF). No fresh
real-world re-occurrence has been observed since — the probe replayed the original evidence file.

## How to re-verify
`functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --check scripts/eval-email/baseline-v2.json`
(regression gate), or re-POST `evidence/RE Client Mrs Ruby Wiggett, Vehicle VOLKSWAGEN T-ROC LIFE TSI S-A
DF72LVV, Our Ref 45391_1.eml` to the deployed `/classify-email` route directly.
