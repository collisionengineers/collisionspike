# Verification — TKT-027: Intermediate intake status beyond 'new'

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

- **Line 1 (distinct status once added to intake):** KQL last-24h — **60 setIngested activity
  logs: 55 updated:true (real new_email → ingested UPDATEs) + 5 updated:false (idempotent no-ops on
  already-progressed cases, the designed guard)**; last stamp minutes before the query. Sample live
  case ids stamped today: d142e09e @16:47:03Z, f5c9a2c8 @16:13:26Z, +6 more. Each applied UPDATE
  writes the status_changed audit ("Status set to ingested (intake pipeline picked up)").
- **Line 2 (automatic, no manual step):** internalCasesSetIngested = **60 requests, all 200, 1:1
  with the orch activity count** — every call originates from intakeOrchestrator step 2.1
  (line 627, immediately after caseResolve), service-auth only, unattended across the day.
- **Line 3 (board/queues reflect it):** the live deployed SPA bundle contains
  `ingested:{label:"Logged"…}` (StatusBadge), the not-ready queue membership, and the funnel
  bucket — handler-plain "Logged".
- **Volume cross-check (not a failure):** ~121 intakes vs 60 stamps is expected — setIngested fires
  only on intakes reaching caseResolve; non-minting lanes (linkReply, images-received, case_update,
  cancellation, pre-instruction) never mint.
- Minor cosmetic note (pre-existing, outside this ticket): the ManualIntake dropdown option renders
  raw "Ingested" (ManualIntake.tsx:1001-1005) vs the badge's "Logged" — terminology follow-up
  candidate.

Queued SQL (corroborative): 24h ingested-stamp audits (≈55); sample transition rows; two observed
case ids now PAST ingested; zero cases stranded at new_email >10 min.

## How to re-verify
The two KQL queries in the verdict (AppTraces setIngested split; AppRequests
internalCasesSetIngested by ResultCode) + the bundle grep for `ingested:{label:"Logged"`.

## Evidence
- **Deploy (2026-07-01):** config-zip to `cespk-api-dev` + `cespk-orch-dev` (WSL `func` unavailable). API **64** functions (+`internalCasesSetIngested`); orch **51** (+`setIngested`). Anon probe `POST …/set-ingested` → **401** (route exists, not 404).
- **Route:** `POST /api/internal/cases/{id}/set-ingested` updates `case_.status_code` only when current status is `new_email` (100000000 → 100000001); writes `status_changed` audit when updated.
- **Pipeline:** `intakeOrchestrator` calls `setIngested` activity (step 2.1) immediately after `caseResolve`, before Box folder / evidence / `statusEvaluate`.
- **UI:** existing `StatusBadge` maps `ingested` → **"Logged"**; `statusToStage` keeps it in the **New** funnel bucket; `not-ready` queue already includes `ingested`.
- **Offline gate:** `node scripts/checks/check-tickets.mjs` + `node verify-all.mjs` (run at close-out).

## Honest gaps
- **Not live-proven:** the transition is brief in a healthy pipeline (`ingested` → review state within seconds). Live proof needs deploy + either a stalled orchestration mid-run or an audit-trail check (`status_changed` with `after.status = ingested`) on the next intake email.
- **Existing cases:** backfill not in scope; only new intakes after deploy get the `new_email` → `ingested` step.

## How to re-verify
1. Deploy `cespk-api-dev` and `cespk-orch-dev` (see `docs/operations/deployment.md`).
2. Send a test email to a production intake mailbox (or trigger manual intake).
3. In Postgres: `SELECT status_code, (SELECT name FROM choice_case_status WHERE code = status_code) FROM case_ WHERE id = '<case_id>'` — expect audit row with `ingested` before final review status.
4. In the SPA queue/board: during pipeline run, badge may show **Logged**; after completion, expect **Needs review** / **Missing images** / etc.
5. App Insights: orchestration custom log `evt: setIngested` with `updated: true` on new cases.
