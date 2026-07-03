# Verification — TKT-029: Case-summary email misclassified as new case

## Verdict
VERIFIED-LIVE (2026-07-02) — live-probed against the deployed engine; locked by an eval-corpus regression pin

## Evidence
- Live probe: the deployed `/classify-email` route (`cespike-parser-dev`) classifies `New inspection
  requests.eml` as `non_actionable`/`case_summary` (not a new case) — per the rules-engine-v2 plan's own
  evidence base, [rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](../../plans/rules_engine_v2_plan_9ba034c4.plan.md).
- Regression pin: manifest item `tkt029-case-summary` in the committed real-email eval harness —
  `category_correct`/`subtype_correct` both `true` at confidence `0.6` in the checked-in
  [baseline-v2.json](../../../scripts/eval-email/baseline-v2.json) (v2-taxonomy aggregate 84.1%, up from
  the v1 baseline 77.3% — [README](../../../scripts/eval-email/README.md)).

## Pending / gaps
Flagged **verified-by-eval but fragile until Phase 2** by the plan's own evidence base: today's correct
result comes from the existing text-signal rules, not yet from a context-aware policy — the root cause is
only durably locked in once Phase 2's triage-policy context layer ships (the `TRIAGE_*` gates are
currently OFF; see [docs/gated.md](../../gated.md) §D6/D7). No fresh real-world re-occurrence has been
observed since — the probe replayed the original evidence file.

## How to re-verify
`functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --check scripts/eval-email/baseline-v2.json`
(regression gate), or re-POST `evidence/New inspection requests.eml` to the deployed `/classify-email`
route directly.
