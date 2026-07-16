# Verification — TKT-216: Repair the EVA Sentry route and body contract

## Verdict
PENDING

## Evidence
- The operator assigned the route/body mismatch to PLAN-004 and required the retained EVA Sentry service to be preserved.
- `services/data-api/src/features/cases/internal-eva-submission.test.ts` passes three contract-boundary
  cases: ordered payload construction, missing-case refusal before evidence reads, and missing-blob refusal.
- `python -m pytest services/functions/eva-sentry/tests -q` passes 43 tests, including exact six-line
  inspection-location and Image Based Assessment mappings.
- The full TypeScript build and all four workspace suites pass on the reconciled branch.
- The Data API, orchestration and EVA adapter were deployed on 2026-07-16. The EVA host was Running with the
  single canonical `eva_instruction_inspection` function registered, and post-deploy API/orchestration
  telemetry contained no new exception or failed/5xx request.
- `EVA_API_ENABLED` remained false or absent. No handler invocation or real external EVA submission is
  claimed, so A6 is not complete.

## Pending / gaps
An authorized, legitimate handler invocation plus read-only trace remains pending. The external-submission
gate must remain off until vendor multi-principal support and the ticket's parity proof exist; this review
did not authorize a live cutover or a real EVA write.

## How to re-verify
Deploy the three retained services, confirm the registered route and a non-mutating health/registration
trace, then attach independent verification for every acceptance line. Do not enable the external
submission gate or send a real instruction as part of that proof.
