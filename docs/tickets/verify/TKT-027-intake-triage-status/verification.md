# Verification — TKT-027: Intermediate intake status beyond 'new'

## Verdict
DEPLOYED — route + activity live; intake `ingested` transition proof pending next email.

## Evidence
- **Deploy (2026-07-01):** config-zip to `cespk-api-dev` + `cespk-orch-dev` (WSL `func` unavailable). API **64** functions (+`internalCasesSetIngested`); orch **51** (+`setIngested`). Anon probe `POST …/set-ingested` → **401** (route exists, not 404).
- **Route:** `POST /api/internal/cases/{id}/set-ingested` updates `case_.status_code` only when current status is `new_email` (100000000 → 100000001); writes `status_changed` audit when updated.
- **Pipeline:** `intakeOrchestrator` calls `setIngested` activity (step 2.1) immediately after `caseResolve`, before Box folder / evidence / `statusEvaluate`.
- **UI:** existing `StatusBadge` maps `ingested` → **"Logged"**; `statusToStage` keeps it in the **New** funnel bucket; `not-ready` queue already includes `ingested`.
- **Offline gate:** `node scripts/check-tickets.mjs` + `node verify-all.mjs` (run at close-out).

## Honest gaps
- **Not live-proven:** the transition is brief in a healthy pipeline (`ingested` → review state within seconds). Live proof needs deploy + either a stalled orchestration mid-run or an audit-trail check (`status_changed` with `after.status = ingested`) on the next intake email.
- **Existing cases:** backfill not in scope; only new intakes after deploy get the `new_email` → `ingested` step.

## How to re-verify
1. Deploy `cespk-api-dev` and `cespk-orch-dev` (see `docs/azure/deploy.md`).
2. Send a test email to a production intake mailbox (or trigger manual intake).
3. In Postgres: `SELECT status_code, (SELECT name FROM choice_case_status WHERE code = status_code) FROM case_ WHERE id = '<case_id>'` — expect audit row with `ingested` before final review status.
4. In the SPA queue/board: during pipeline run, badge may show **Logged**; after completion, expect **Needs review** / **Missing images** / etc.
5. App Insights: orchestration custom log `evt: setIngested` with `updated: true` on new cases.
