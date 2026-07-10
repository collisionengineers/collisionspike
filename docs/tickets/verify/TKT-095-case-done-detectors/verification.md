# Verification — TKT-095: Case `done` detectors

## Verdict
PENDING — deployment fully certified; every acceptance line awaits its trigger event.

Verified by: ticket-verifier dispatch, 10-07-26. Findings:
- **Deployed surface certified live (az reads):** all six TKT-095 detector functions registered on
  cespk-orch-dev (graph-webhook-sent, graph-lifecycle-sent, sent-items-processor,
  eva-report-poll-start, evaReportPollOrchestrator, evaReportPollTick); markCaseDone /
  internalCasesMarkDone / internalCasesLookup / completedCases / markEvaSubmitted on cespk-api-dev;
  detector (b) rides the existing box-webhook (12 fns, no new registration). Gates dark by design:
  DONE_SENT_EMAIL_ENABLED absent, EVA_API_ENABLED absent (live appsettings read).
- **Line 1 (manual bridge):** route + SPA button live in the deployed bundle (renders only under
  status eva_submitted; handler-plain copy "Mark report delivered"). Not exercisable — zero
  eva_submitted/done cases exist (corroborated by TKT-096's verifier: all-time Sent-to-EVA = 0);
  KQL 3d: zero mark-done requests.
- **Line 2 (detector b, Box report-PDF):** wiring confirmed in the deployed box-webhook
  (is_ce_report → engineer_report → best-effort mark_case_done); the FILE.UPLOADED lane is alive
  (62 webhook requests/3d) but 0 "CE report detected" — no report-named PDF has landed. Expected
  absence. Re-delivery no-op guard offline-proven (150 pytest incl. the redelivery case).
- **Line 3 (detector a, sent-email):** requires the operator-approved DONE_SENT_EMAIL_ENABLED
  test-slot flip (creates per-mailbox SentItems Graph subscriptions — gated.md D3). Zero detector
  invocations in 3d KQL; only the 3 Inbox Graph subs exist. An operator wait, not implementer debt.
- Detector (c) EVA poll: no acceptance line; skeleton correctly dark pending EVA REST.
- **Real bugs found: none.**

Queued SQL (next data pass): status distribution (expect no 100000008/100000012 rows);
report_delivered audits (expect 0); the per-case proof query for after the first flip.

**Re-verify recipe:** drive a ready_for_eva case (27 exist) through Export-for-EVA → the button
renders → mark done → report_delivered audit; drop `<CasePO> report.pdf` into that case's Box folder
→ "CE report detected" + mark-done updated=True; operator test-slot flip for line 3
(create-then-prune both observed). KQL files reusable: scratchpad a-orch-dark/b-boxfn/c-api-markdone.

## Evidence (offline + deploy, 2026-07-09)
- Shared transition: `POST /api/internal/cases/{id}/mark-done` live on `cespk-api-dev`
  (94 functions; unauthenticated smoke 401); guarded `WHERE status_code = eva_submitted`.
- Manual bridge: staff `POST /api/cases/{id}/mark-done` + the CaseDetail "Mark report delivered"
  button deployed with the SPA (button renders only on `eva_submitted`).
- Detector (b): box-webhook redeployed (12 functions) with the pure report classifier +
  `mark_case_done`; pytest **150 passed** (incl. mark-done-failure-still-200 + redelivery cases).
- Detector (a): DARK — orch deployed with the SentItems webhook/lifecycle/queue processor behind
  `DONE_SENT_EMAIL_ENABLED` (absent live = off; registry records it); **no Graph subscription was
  created**; subscription-maintenance gate-flip semantics (create on ON / prune on OFF /
  byte-identical while OFF) covered by vitest (orch suite 228 passed).
- Detector (c): DARK skeleton behind `EVA_API_ENABLED` (absent) — keyed starter + eternal-orch
  stub only; the GetAvailableReports poll body deliberately unbuilt until EVA REST activates.

## Pending / gaps (live proof)
1. Manual bridge: an `eva_submitted` case → button → badge Done + `report_delivered` audit row +
   appears under Completed.
2. Detector (b): a report-named PDF into a case Box folder flips `eva_submitted → done`;
   re-delivery no-op. (Needs the operator's normal report-upload workflow or a test upload under
   the archive root.)
3. Detector (a): requires an operator-approved test-slot gate flip (creates SentItems Graph
   subscriptions — mailbox-adjacent, deliberately NOT done this wave); verify create AND prune.
4. Detector (c): correctly unprovable while EVA REST is gated.

## How to re-verify
- Bridge: drive a `ready_for_eva` case through Export-for-EVA then "Mark report delivered";
  check `GET /api/cases/{id}/activity` for `eva_submitted` then `report_delivered`.
- (b): drop `<CasePO> report.pdf` into that case's Box folder; watch box-webhook traces for the
  classifier + `mark_case_done` `{updated:true}`; re-deliver → `{updated:false}`.
- (a): flip `DONE_SENT_EMAIL_ENABLED=true` on `cespk-orch-dev` (operator), wait one maintenance
  tick, confirm SentItems subs exist; send a threaded reply to the provider; case flips; flip the
  gate back off and confirm the subs are pruned.
