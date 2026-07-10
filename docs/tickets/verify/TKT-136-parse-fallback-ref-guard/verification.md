# Verification — TKT-136: Guard the /parse fallback reference against money values and text fragments (RIGERANT R1234YF)

## Verdict
TESTED (offline)

Verified by: ticket-verifier dispatch, 10-07-26. Per the verifier: "Running the queued SQL with the
expected results is sufficient to upgrade to VERIFIED-LIVE; no code gap found." Q1–Q6 ride the next
(W4) data pass.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

- **Line 1 (RIGERANT no case_ref; money shapes rejected):** verifier's own runs — sibling
  test_regression 2 passed (RIGERANT fixture pins reference:"" + vrm:""), test_reference_guards
  **33 passed** (money/currency/fragment/tier-4/doc-path shapes). Guards provably in the DEPLOYED
  engine: `git show engine-v2.13:…rules/engine.py` contains all 3 guard defs; v2.12→v2.13 diff on
  the file is empty; registry records the parser redeployed at engine-v2.13 on 2026-07-09; vendored
  copy in sync for both guard files. Live traffic through the guarded parser since 07-09: parse
  249×200 + 13×422 (input validation), extract_images 166, classify_email 314 — 0 failed, 0
  exceptions.
- **Line 2 (junk refs enumerated + cleared with audit):** the 13-row enumeration CSV + the executed
  idempotent delta (backup table, per-row audits, actor delta:2026-07-09-tkt136-ref-junk-cleanup)
  are committed; execution recorded in the registry ("4 junk case_refs cleared incl. the RIGERANT
  marker, 8 RJS refs label-stripped, WLS26001 left for operator judgement"). Direct row readback =
  queued Q1–Q4.
- **Line 3 (no sibling regression):** verifier's own full run at sibling HEAD (engine-v2.14):
  **451 passed / 4 skipped / 0 failed**.
- **Drain-artifact lane judgement:** JUL2026 (drain Held mint) is the SNIFF lane, not this ticket's
  /parse document lane — and is a shared month+year-composite guard gap (same class as MAY2026),
  already filed under TKT-140's follow-ups; EY12SSU vs YE12SSU is a value-accuracy discrepancy
  between two well-formed plates, outside this guard class; the dry-run junk keys are historical
  pre-guard sniff artifacts. None are TKT-136 regressions; none double-counted.
- **Expected absences:** no guard-hit telemetry (the engine emits none); 422s are input validation.
- **Report-only finding:** the sibling working tree carries an uncommitted TKT-089-reopen edit
  (banner ratio 3.5→3.2) making the vendored-sync test fail on service.py — in-flight WIP of the
  TKT-089 fix, not this ticket's files. Also the delta's trailing comment says "7 label-free refs"
  where 8 strip rows exist — expect 8 in Q3 (comment typo).

## Queued SQL for the W4 data pass (upgrade condition)
Q1 RIGERANT marker case (expect case_ref NULL) · Q2 cleanup completeness (expect 0) · Q3 the 12
backed-up rows' current values (4 NULL + 8 label-free) · Q4 audit trail (12 rows, 2026-07-09) ·
Q5 forward window: new cases since deploy with junk-class case_ref (expect 0) · Q6 forward window:
junk-class VRM (the JUL2026 Held mint WILL surface — sniff lane, judged above, not a regression).
Full SQL in the verifier transcript; results to be appended here.

## How to re-verify
Sibling: `pytest tests/test_reference_guards.py tests/test_regression.py -q` → 35 passed. Deployed
provenance: the engine-v2.13 git-show greps. KQL: AppRequests/AppExceptions since 2026-07-09 on
cespike-parser-law-dev. Then Q1–Q6.

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.
