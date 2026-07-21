# Changes — TKT-291: classify_email() gains attachment_content_typings (PLAN-014 Slice 1 / D4)

## Status
coded, offline-verified — awaiting PR review/merge

## Re-homed to the canonical engine (post engine-merge, TKT-287)

The cedocumentmapper engine merge (TKT-287, PR #145) made
`services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/` the CANONICAL authoring source and
retired the vendoring mechanism (`VENDOR_LOCK.json`, `PROVENANCE.md`, `verify_vendor_pin.py` are
gone). This slice's classifier change is therefore authored in the canonical engine source and
materialized into both deployed copies by `scripts/build/sync-engine.py` — the old vendor-lock /
provenance dance no longer exists. `scripts/checks/check-engine-materialized.py` verifies the three
copies stay byte-identical (PASS).

## What changed

- `services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/rules/email_classifier.py` (canonical)
  — new optional `attachment_content_typings` param (absent/empty → byte-identical to today's
  output); the D4 derivation; `has_report_attachment`/`has_instruction_doc` consume it; a new
  `attachment_content_typings:...` explainability signal.
- `services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/detection/attachment_typing.py`
  (canonical) — the Slice-3 backtest fix (a report-title phrase riding on a dual report+audit
  commissioning phrase now needs Rule 1b's corroboration rather than standing alone); and the stale
  `PROVENANCE.md` docstring reference repointed to the engine README (that file was deleted by the
  engine merge — engine-review finding).
- Materialized copies regenerated via `sync-engine.py`:
  `services/functions/{parser,ocr}/cedocumentmapper_v2/{rules/email_classifier.py,
  detection/attachment_typing.py, ENGINE_FINGERPRINT.json}`.
- `packages/domain/src/domain/classification.ts` — the D4 precedence cross-reference, corrected per
  review: `unknown` **abstains** (the filename-derived kind stands); **only `junk` withdraws** an
  instruction promotion — the doc no longer claims `unknown` withdraws.
- Tests relocated to the canonical engine test dir (where the CI `engine` job runs pytest):
  `services/engine/cedocumentmapper_v2/tests/{test_email_classifier_content_typings.py,
  test_email_classifier_tkt288_overlap_tripwires.py, test_attachment_typing_dual_commissioning.py}`
  (`git rm` from `services/functions/parser/tests/`; the dual-commissioning file was renamed to avoid
  colliding with the engine's pre-existing `test_attachment_typing.py`).

## Per-file precedence fix (automated-review P1, addressed)

The originally-shipped D4 aggregated all attachment typings into ONE set, discarding per-attachment
mapping — so a content-typed `report` on one attachment could suppress an email that ALSO carried a
genuine content-typed `instruction` (routing a work email to query, preventing case creation).
Corrected to reconcile per the D4 contract (content overrides filename PER FILE):

- `content_detected_instruction = "instruction" in content_doc_types`;
- `content_detected_report = "report" in content_doc_types and not content_detected_instruction`
  (a sibling report no longer suppresses when an instruction is present);
- `has_instruction_doc = (bool(kinds & _INSTRUCTION_KINDS) or content_detected_instruction) and not
  content_withdraws_instruction` (a content-typed instruction promotes even under a generic filename).

Two new unit tests pin these branches (report+instruction siblings → `existing_provider_instruction`;
content-`instruction` under an `image` filename kind → promotes). The TKT-288 tripwire tests are
UNCHANGED (they call `classify_email()` without typings, exercising only base behavior, which the fix
leaves byte-identical). The `unknown`-alone-abstains behavior (a Slice-3 backtest finding) is kept.

## Backtest (go/no-go, re-run against the re-homed engine)

Slice 3's `run_ab_parsefed.py` over the labelled corpus: **OLD 51/58 (87.9%) → NEW 53/58 (91.4%),
0 regressions, 2 improvements** (`tkt023-original-reply`, `tkt032-pcd-diminution`) — reproduces the
saved baseline EXACTLY. The per-file-precedence correction adds correctness without regressing.
(Run locally without tesseract, so OCR-dependent scanned-PDF content typings were not exercised — the
CI `engine` job has tesseract; the aggregate still reproduced the baseline exactly.)

## What did NOT change

`open_case_ref_match` (already accepted/used — Slice 2 wires the route/client). `attachment_typing.py`
Rule 1b/2/3 logic, `_REPORT_TITLE_PHRASES`, and `providers.json` are otherwise unchanged. No TKT-288
finding is fixed (tripwires only).
