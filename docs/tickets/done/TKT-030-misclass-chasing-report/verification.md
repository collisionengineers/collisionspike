# Verification — TKT-030: Report-chaser misclassified as new work

## Verdict
VERIFIED-LIVE (2026-07-02) — live-probed against the deployed engine; locked by an eval-corpus regression pin

## Evidence
- Live probe: the deployed `/classify-email` route (`cespike-parser-dev`) classifies `RE 30143 - Mussie
  Belay - BX67OEY .eml` as `query`/`query_existing_work` (not new work) — per the rules-engine-v2 plan's
  own evidence base, [rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](TKT-030-misclass-chasing-report.md).
- Regression pin: manifest item `tkt030-chaser` in the committed real-email eval harness —
  `category_correct`/`subtype_correct` both `true` at confidence `0.8` in the checked-in
  [baseline-v2.json](../../../../scripts/evaluation/email/baseline-v2.json) (v2-taxonomy aggregate 84.1%, up from
  the v1 baseline 77.3% — [README](../../../../scripts/evaluation/email/README.md)).

## Pending / gaps
Flagged **verified-by-eval but fragile until Phase 2** by the plan's own evidence base: today's correct
result comes from the existing text-signal rules, not yet from a context-aware policy — the shared
thread-scoping root cause (with TKT-033, same email) is only durably locked in once Phase 2's
triage-policy context layer ships (the `TRIAGE_*` gates are currently OFF; see
[docs/tickets/BOARD.md](../../BOARD.md) §D6/D7). No fresh real-world re-occurrence has been observed since — the
probe replayed the original evidence file.

## How to re-verify
`python scripts/evaluation/email/run_eval.py --check scripts/evaluation/email/baseline-v2.json`
(regression gate), or re-POST `evidence/RE 30143 - Mussie Belay  -  BX67OEY  .eml` to the deployed
`/classify-email` route directly.
