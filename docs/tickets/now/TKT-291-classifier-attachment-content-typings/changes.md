# Changes — TKT-291: classify_email() gains attachment_content_typings (PLAN-014 Slice 1)

## Status
coded, offline-verified — awaiting PR review/merge

## What changed

- `services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py` — new optional
  `attachment_content_typings` param; `content_doc_types`/`content_detected_report`/
  `content_withdraws_instruction` derivation; `has_report_attachment`/`has_instruction_doc`
  updated to consume them; a new `attachment_content_typings:...` signal entry for
  explainability.
- `services/functions/parser/cedocumentmapper_v2/VENDOR_LOCK.json` — `contentSha256` updated
  to the new worktree hash (direct in-repo edit, not a re-vendor from a new tag).
- `services/functions/parser/cedocumentmapper_v2/PROVENANCE.md` — new "Known exception"
  section recording this deliberate, real (not wording-only) divergence and why.
- `packages/domain/src/domain/classification.ts` — module-doc cross-reference explaining
  D4's opposite-direction precedence vs. `classifyAttachment()`'s extension-wins rule (a
  documentation-only change; `classifyAttachment()`'s behavior is unchanged).
- **New** `services/functions/parser/tests/test_email_classifier_content_typings.py` — 6
  tests: 2 parity (omitted/None/[] identical across 2 real existing scenarios), content
  `report` override, content `junk` withdrawal, content `unknown`-alone withdrawal, content
  `instruction` (agreeing) does NOT withdraw.
- **New** `services/functions/parser/tests/test_email_classifier_tkt288_overlap_tripwires.py`
  — 4 tests pinning today's known pre-existing behavior for TKT-288 findings #5/#9/#12/#13
  (tripwires, not fixes — no scope creep).

## What did NOT change

`open_case_ref_match` (already accepted, already used — only Slice 2's route/client wiring is
missing). No existing test assertion was altered. `detection/attachment_typing.py` is
unchanged (already correct). No TKT-288 finding is fixed.
