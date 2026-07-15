# Verification — TKT-031: Client report-chaser misrouted to 'Other'

## Verdict
VERIFIED-LIVE (2026-07-09) — the deployed-parser live probe (see § Verdict update — 2026-07-09 below) closed the gap.

> **Prior state (superseded 2026-07-09):** EVAL-PASSING (2026-07-02) — NOT yet confirmed live.

## Evidence
Manifest item `tkt031-client-chaser` in the committed real-email eval harness scores
`category_correct`/`subtype_correct` both `true` at confidence `0.8` in the checked-in
[baseline-v2.json](../../../../scripts/evaluation/email/baseline-v2.json) (v2-taxonomy aggregate 84.1%, up from the
v1 baseline 77.3% — [README](../../../../scripts/evaluation/email/README.md)). Unlike TKT-030/033/036/037/038/040,
this sample is **not** named in the rules-engine-v2 plan's live-probe list
([rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](TKT-031-misclass-client-chasing.md))
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
`python scripts/evaluation/email/run_eval.py --check scripts/evaluation/email/baseline-v2.json`
(regression gate — confirms the corpus pass still holds), then re-POST
`evidence/(EREF12) RTA on 15_06_2026  Mr Daniel James Page (Our Ref SAB_46286_1, Vehicle HN13XMO).eml` to
the deployed `/classify-email` route to close the live-probe gap.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. The ticket's own sample .eml POSTed to the deployed parser POST /api/classify-email -> 200 query/query_existing_work at 0.8, rule:query_with_reference, signals carrying body_jobref:SAB/46286/1 + body_vrm:HN13XMO + chase_keywords. Regression pin tkt031-client-chaser green in baseline-v2; registry cross-checked (live parser engine-v2.7, taxonomy v2). This was exactly the closing condition this file's Pending section specified.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
