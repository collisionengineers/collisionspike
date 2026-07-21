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

## Follow-up (added after Slice 3/TKT-293's backtest go/no-go run found 3 real regressions)

PLAN-014 Slice 3's OLD-vs-NEW backtest (`run_ab_parsefed.py`) against the real 67-item corpus
found D4 as originally built regressed 3 items. Root-caused and fixed here, in this same
ticket/PR, per the review-gate discipline ("if a later slice finds an earlier slice was
actually wrong, fix it in the earlier PR"):

- `content_withdraws_instruction` now requires an actual `junk` verdict, not just "no
  report/instruction present" — a bare `unknown` (the detector's own deliberate, safe abstain
  default) no longer withdraws a promotion. Fixes `tkt100-qdos-lead`'s regression.
- `services/functions/parser/cedocumentmapper_v2/detection/attachment_typing.py` — one narrow
  fix: a report-title phrase hit riding on a dual report+audit commissioning phrase (a QDOS
  "ENGINEER NOTIFICATION (REPORT + AUDIT REPORT)" heading — an INSTRUCTION commissioning both,
  per `rules/engine.py`'s own already-existing `dual_report_audit_phrases` signal) now needs
  the same corroboration Rule 1b already requires, rather than standing alone. Fixes
  `QDOS261253`/`QDOS261530`'s regressions.
- **New** `services/functions/parser/tests/test_attachment_typing.py` — 4 direct unit tests
  for `type_document_text()` pinning the fix and guarding the ordinary (non-dual) report-title
  case.
- Updated: `test_content_typed_unknown_alone_withdraws_instruction_promotion` →
  `test_content_typed_unknown_alone_does_not_withdraw_instruction_promotion` (behavior
  genuinely changed, correctly).
- `VENDOR_LOCK.json`/`PROVENANCE.md` updated again to cover both files' direct edits.

## What did NOT change

`open_case_ref_match` (already accepted, already used — only Slice 2's route/client wiring is
missing). `detection/attachment_typing.py`'s Rule 1b/2/3 logic, `_REPORT_TITLE_PHRASES`
themselves, and its `providers.json` inputs are otherwise unchanged. No TKT-288 finding is
fixed.
