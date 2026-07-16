# Verification — TKT-136: Guard the /parse fallback reference against money values and text fragments (RIGERANT R1234YF)

## Verdict
VERIFIED-LIVE

Final certification (ticket-verifier, 10-07-26, after the W4 data pass). Rationale: "Every
acceptance class now carries live proof — Q1/Q3/Q4 exact (RIGERANT NULL, 4 clears + 8 label-free
strips, 12 audits), the forward window shows **0 money / 0 fragment / 0 RIGERANT-class refs and 0
document-lane junk VRMs** across ~36h of guarded production traffic (249+ /parse runs, 0
exceptions — stronger than the single synthetic probe the remainder envisaged), and the sibling
suite is green (451/4)."

**Ruling on the W4 anomaly (6 rows, RJS26010–26015):** OUT-OF-LANE — real, recoverable references
with a glued "Our Reference:" label prefix; the delta itself classified that shape as a distinct
strip-label repair class; the Acceptance never mentions label-stripping. **→ File as its own
follow-up ticket** (strip leading label prefixes on the RJS lane), carrying two research notes:
(a) lane attribution open — a title-case capture would be REJECTED by the deployed fragment guard
(head "Our" fails REF_PREFIX_HEAD_RE), so fresh glued mints likely arrive via the RJS layout's
labelled rule / classifier sniff / an uppercase capture — probably not the fallback path this ticket
guards; (b) the delta header's "the engine fix stops NEW junk" sentence oversold by this one class.
Q6's JUL2026×2 + JUN2026 are the Held sniff-lane month+year composites already routed via TKT-140's
follow-up. Timestamp nuance for the follow-up: RJS26010 (07-09 10:27Z) may predate the D2 publish;
the 07-10 rows are unambiguously post-deploy.

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
  between two well-formed plates, outside this guard class; the dry-run junk keys are prior
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
