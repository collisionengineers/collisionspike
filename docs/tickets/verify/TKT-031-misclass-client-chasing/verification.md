# Verification — TKT-031: Client report-chaser misrouted to 'Other'

## Verdict
EVAL-PASSING (2026-07-02) — NOT yet confirmed live

## Evidence
Manifest item `tkt031-client-chaser` in the committed real-email eval harness scores
`category_correct`/`subtype_correct` both `true` at confidence `0.8` in the checked-in
[baseline-v2.json](../../../../scripts/eval-email/baseline-v2.json) (v2-taxonomy aggregate 84.1%, up from the
v1 baseline 77.3% — [README](../../../../scripts/eval-email/README.md)). Unlike TKT-030/033/036/037/038/040,
this sample is **not** named in the rules-engine-v2 plan's live-probe list
([rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](../../../plans/rules_engine_v2_plan_9ba034c4.plan.md))
— the eval harness calls the vendored engine directly as a Python function (no HTTP, no Azure), so this is
a corpus pass, not a live-endpoint probe or a fresh real-world occurrence.

## Pending / gaps
Per BOARD's truth standard, `done` needs a test **or** live probe with no known gap. This ticket has the
eval-corpus test but not yet a live probe/occurrence — stays `now` until one of those lands (a direct
`/classify-email` POST against the deployed parser, or a genuine new inbound email of this shape).

## How to re-verify
`functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --check scripts/eval-email/baseline-v2.json`
(regression gate — confirms the corpus pass still holds), then re-POST
`evidence/(EREF12) RTA on 15_06_2026  Mr Daniel James Page (Our Ref SAB_46286_1, Vehicle HN13XMO).eml` to
the deployed `/classify-email` route to close the live-probe gap.
