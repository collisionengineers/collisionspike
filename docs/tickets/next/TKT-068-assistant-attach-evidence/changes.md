# Changes — TKT-068: Attach files in the assistant and add them to a case (user-confirmed upload)

## Status
next — server-side groundwork landed; the assistant attach-UX is the remaining slice. Built DARK-safe
(staff-role route; the model gets NO upload capability). Under
[PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 2; ADR-0024.

## Commits
- `754c38a` — ai: PLAN-001 Phase 2 (evidence upload route + validation; no model upload tool).

## Files touched
- `api/src/functions/evidence-upload.ts` — `POST /api/cases/{id}/evidence/upload` (multipart, staff role,
  size/type guard, blob + `evidence` row + audit `evidence_added`). Route in `api/src/index.ts`.
- `api/src/lib/upload-validate.ts` (+ `upload-validate.test.ts`) — `classifyUpload` (images + PDFs, ≤15MB).
- `api/src/lib/audit.ts` + `migration/assets/schema/000_enums_lookups.sql` — `evidence_added` action code
  (`100000049`) + its `choice_audit_action` row.
- `mockup-app/src/data/rest-client.ts` + `data/index.ts` — `uploadEvidence` data method.

## Summary
Built the human-driven server path: a staff-authorised multipart upload route that validates size/type,
stores bytes, records an `evidence` row, and audits `evidence_added`. Per ADR-0024 **the model gets no
upload tool** — bytes only ever come from a human file-picker. Remaining slice: the conversational
attach UX in the assistant drawer. Left in `next` because that user-facing deliverable is not built.
