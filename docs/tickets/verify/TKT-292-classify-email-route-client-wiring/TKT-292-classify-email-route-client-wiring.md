---
id: TKT-292
title: Wire open_case_ref_match and attachment_content_typings through /classify-email (PLAN-014 Slice 2)
status: verify
priority: P2
area: parsing
tickets-it-relates-to: [TKT-291]
research-link: workingspace/proposedparserchanges.md
plan: PLAN-014
---

# Wire open_case_ref_match and attachment_content_typings through /classify-email (PLAN-014 Slice 2)

## Problem

TKT-291 (Slice 1) made `classify_email()` accept `open_case_ref_match` (already accepted before
this work, just never wired) and the new `attachment_content_typings`. Neither field reached the
function in practice: the `/classify-email` HTTP route never read them from the request body, and
the TypeScript `functions-client.ts`'s `callClassifyEmail` never sent them.

## Proposed change (built)

- `services/functions/parser/function_app.py`'s `_classify_email`: read, validate (string /
  list-of-objects), and pass through both fields. Absent = today's defaults (`""` /
  `classify_email`'s own `None` default) — no behavior change until a caller populates them.
- `services/orchestration/src/adapters/functions-client.ts`'s `callClassifyEmail`: add
  `openCaseRefMatch?: string` and `attachmentContentTypings?: Array<{filename, docType}>`, mapped to
  the route's snake_case wire shape (`open_case_ref_match`, `attachment_content_typings` with
  `doc_type`). Defaults (`''` / `[]`) reproduce today's request exactly when omitted.

No orchestrator caller populates these yet — that's Slice 4a.

## Acceptance

- Route accepts + validates both fields; rejects a non-string `open_case_ref_match` and a
  non-list-of-objects `attachment_content_typings` with `400 bad_field`, mirroring the existing
  field-validation convention.
- A route-level test proves the field actually reaches `classify_email` (not just accepted and
  dropped): a content-typed report with a non-hinting filename suppresses fresh-instruction
  promotion through the full HTTP path.
- `callClassifyEmail` defaults both new fields to empty/`[]` when omitted (byte-identical legacy
  request) and maps camelCase to the wire's snake_case correctly when provided.
- Full parser pytest suite green; full orchestration vitest suite green.

## Research

PLAN-014 Slice 2 — see `workingspace/proposedparserchanges.md` for the full parse-fed reorder this
serves. Stacked on TKT-291/PR #148 (Slice 1) since this field only has any effect once `classify_email`
accepts it.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
