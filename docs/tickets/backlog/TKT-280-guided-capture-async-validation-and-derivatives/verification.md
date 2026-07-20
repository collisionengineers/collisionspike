# Verification — TKT-280: Guided capture async validation worker and derivatives

## Verdict
NOT YET IMPLEMENTED

## Evidence
Retention cleanup and synchronous structural guards are shipped and tested under TKT-200 (see
`capture-cleanup.ts`, `upload-validate.ts` and their test suites) — not re-verified here since they're
out of this ticket's narrowed scope. No async worker, OCR hookup, or derivative generation exists yet.

## Pending / gaps
- Async validation worker (evidence-backfill.ts pattern).
- Advisory OCR/plate-read for capture assets.
- Display-derivative generation.

## How to re-verify
Build against the pattern in `services/orchestration/.../evidence-backfill.ts` and add offline tests
proving async-path idempotency before enabling.
