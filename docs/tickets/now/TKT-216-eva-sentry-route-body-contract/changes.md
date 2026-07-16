# Changes — TKT-216: Repair the EVA Sentry route and body contract

## Status
deployed dark on 2026-07-16 — external invocation proof remains pending

## Files touched
- `services/orchestration/src/activities/service-clients.ts`
- `services/data-api/src/features/cases/internal-eva-submission.ts`
- `services/data-api/src/features/cases/internal-eva-submission.test.ts`
- `services/functions/eva-sentry/payload.py`
- `services/functions/eva-sentry/function_app.py`
- `services/functions/eva-sentry/tests/test_payload.py`

## Summary
The orchestration caller now uses the retained service's actual
`POST /api/eva/instruction-inspection` seam with `{ "evaPayload12": ... }`. The Data API builds that
payload only from persisted case fields and ordered, accepted image bytes, and fails closed when the
case/evidence is missing. The EVA adapter maps the canonical six-line inspection address to the vendor
`InspLoc*` fields, handles Image Based Assessment without inventing an address, and supplies the required
inspection type. The Data API, orchestration and EVA adapter were deployed, the canonical EVA function was
registered, and the submission gate remained off. No external EVA submission was made.
