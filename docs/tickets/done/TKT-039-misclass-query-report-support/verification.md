# Verification — TKT-039: Report-support request misclassified as new case

## Verdict
VERIFIED-LIVE (2026-07-09) — the deployed-parser live probe (see § Verdict update — 2026-07-09 below) closed the gap.

> **Prior state (superseded 2026-07-09):** EVAL-PASSING (2026-07-02) — NOT yet confirmed live.

## Evidence
Manifest item `tkt039-report-support` in the committed real-email eval harness scores
`category_correct`/`subtype_correct` both `true` at confidence `0.8` in the checked-in
[baseline-v2.json](../../../../scripts/eval-email/baseline-v2.json) (v2-taxonomy aggregate 84.1%, up from the
v1 baseline 77.3% — [README](../../../../scripts/eval-email/README.md)). Unlike TKT-030/033/036/037/038/040,
this sample is **not** named in the rules-engine-v2 plan's live-probe list
([rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](../../../plans/rules_engine_v2_plan_9ba034c4.plan.md))
— the eval harness calls the vendored engine directly as a Python function (no HTTP, no Azure), so this is
a corpus pass, not a live-endpoint probe or a fresh real-world occurrence.

## Pending / gaps
None — closed 2026-07-09. The eval-corpus test is now joined by the live probe (a direct `/classify-email`
POST against the deployed parser — see § Verdict update — 2026-07-09 below), which was the sole outstanding
condition, so the ticket is `done` with no known gap.

> **Prior state (superseded 2026-07-09):** Per BOARD's truth standard, `done` needs a test **or** live probe
> with no known gap. This ticket has the eval-corpus test but not yet a live probe/occurrence — stays `now`
> until one of those lands (a direct `/classify-email` POST against the deployed parser, or a genuine new
> inbound email of this shape).

## How to re-verify
`functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --check scripts/eval-email/baseline-v2.json`
(regression gate — confirms the corpus pass still holds), then re-POST `evidence/Client Mrs Ruby Wiggett,
Vehicle VOLKSWAGEN T-ROC LIFE TSI S-A DF72LVV, Our Ref 45391_1.eml` to the deployed `/classify-email` route
to close the live-probe gap.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Sample .eml (incl. EngineersReport-V1.pdf as attachment context) POSTed to the deployed classify route -> 200 query/query_existing_work, signals report_attachment + body_jobref:45391/1 + rule:query_with_reference. query is a non-minting category under the deployed categoryMintsCase guard. Pin tkt039-report-support green. Same closing standard as TKT-030/033/036-040.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
