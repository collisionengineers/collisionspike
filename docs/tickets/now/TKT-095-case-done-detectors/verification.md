# Verification — TKT-095: Case `done` detectors

## Verdict
PENDING — all four rungs code-complete + offline-tested and DEPLOYED (2026-07-09, PLAN-003
lifecycle wave); no rung has live proof yet (nothing can flip until a case reaches
`eva_submitted`, which the TKT-094 export flow only started producing this deploy).

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
