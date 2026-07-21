---
id: TKT-291
title: classify_email() gains attachment_content_typings (PLAN-014 Slice 1 / D4)
status: verify
priority: P2
area: parsing
tickets-it-relates-to: [TKT-290, TKT-288, TKT-043, TKT-287]
research-link: workingspace/proposedparserchanges.md
plan: PLAN-014
---

# classify_email() gains attachment_content_typings (PLAN-014 Slice 1 / D4)

## Problem

Today `classify_email()` (`services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py`)
judges attachments only by filename/extension-derived `attachment_kinds` — its own documented weakest
signal. An invoice/remittance PDF reads as `instruction`; a photos-only PDF with a generic filename
reads as neither instruction nor report. The parser already computes real content-based document
typing (`detection/attachment_typing.py`'s `type_document_text`, surfaced via `/parse`'s response) but
that signal never reaches the classifier — its own docstring already names this exact gap as a
tracked follow-up needing "a pipeline reorder."

## Evidence

- `detection/attachment_typing.py`'s `type_document_text()` docstring: "cannot feed back into
  `classify_email`'s Rule 1 corroboration gate without a pipeline reorder... tracked in the consuming
  repository's ticket system."
- `email_classifier.py`'s `has_instruction_doc`/`has_report_attachment` (pre-change) derive from
  `attachment_kinds`/`_has_report_attachment(filenames)` only — no content signal.
- `open_case_ref_match` is already an accepted, already-used param on `classify_email()` — confirms
  the classifier already accepts orchestration-resolved context, this is the same pattern.

## Proposed change (built)

New optional `attachment_content_typings` param (sparse list of `{filename, doc_type}`, `doc_type` in
`instruction|report|junk|unknown`). Refinement rule: a content-detected `report` sets
`has_report_attachment` (feeding the existing `suppress_as_query` report branch) even when the
filename doesn't hint report; a content-detected `junk`/`unknown` (with no `report`/`instruction` in
the set) withdraws `has_instruction_doc`'s promotion. Absent/empty input is byte-for-bit identical to
prior output (parity-tested).

**Authored in the canonical engine source (the engine merge has LANDED)** — TKT-287 / PR #145 merged,
so `services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/` is now the single authoring source
and the vendoring mechanism (`VENDOR_LOCK.json`/`PROVENANCE.md`/`verify_vendor_pin.py`) is retired.
This change is made there and materialized into both deployed copies (parser + ocr) by
`scripts/build/sync-engine.py`; `check-engine-materialized.py` enforces byte-identity. See `changes.md`
for the re-home detail and the per-file-precedence correction applied on the way in.

**D4 vs. `classifyAttachment()` precedence-philosophy** — documented in 3 places (this ticket,
`email_classifier.py`'s inline comment at the change site, `packages/domain/src/domain/classification.ts`'s
module doc): both follow "the more reliable signal wins," reaching opposite surface answers because
`classifyAttachment()`'s extension-vs-MIME signals are equally cheap guesses, while D4's content signal
is not a guess (parse already read the document).

**TKT-288 overlap** — 4 of TKT-288's 16 ported findings (#5, #9, #12, #13, all currently only on the
unmerged `engine/cedocumentmapper-merge` branch) sit in or beside the exact dispatch block D4 touches.
No fix attempted here (out of scope, no scope creep) — instead, `test_email_classifier_tkt288_overlap_tripwires.py`
pins today's known-buggy output for one concrete scenario per finding, so a future TKT-288 pickup sees
a deliberate, visible diff rather than a silent double-fix.

## Acceptance

- `attachment_content_typings=None`/`=[]` byte-for-bit identical to omitting it, proven against 2 real
  existing-suite scenarios (not synthetic).
- Content `report` overrides a filename-derived `instruction` kind when the filename itself doesn't
  hint report (closes the exact gap `attachment_typing.py`'s docstring names).
- Content `junk` (alone) withdraws an instruction-doc promotion; content `unknown` ABSTAINS (the
  filename-derived kind stands — corrected per review + the Slice-3 backtest finding); content
  `instruction` promotes even under a generic filename (per-file precedence).
- A content-typed `report` on one attachment does NOT suppress an email that also carries a
  content-typed `instruction` (per-file precedence, automated-review P1).
- 4 TKT-288-overlap tripwire tests pin today's current (known pre-existing) output for findings
  #5/#9/#12/#13 (unchanged — they pass no typings).
- Engine pytest suite green (`services/engine/cedocumentmapper_v2`, 466 passed / 7 env-skipped);
  `check-engine-materialized.py` PASS (canonical == both deployed copies).

## Research

PLAN-014 Slice 1 (see `workingspace/proposedparserchanges.md` for the full parse-fed reorder this
serves). Sequencing decision and the archived-sibling-repo handling were confirmed with the operator
2026-07-21 ("its because its been merged???? just edit it directly... we arent doing that vendoring
nonsense anymore").

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
