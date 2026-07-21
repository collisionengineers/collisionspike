# Verification — TKT-291: classify_email() gains attachment_content_typings (PLAN-014 Slice 1)

## Verdict
TESTED-OFFLINE

## Evidence

- **Engine suite (canonical home):** `cd services/engine/cedocumentmapper_v2 && python -m pytest
  tests -q` — **466 passed, 7 skipped, 0 failed**. The 7 skips are environmental (tesseract binary
  absent ×2; v1-sibling-repo fixtures absent ×5), not real failures. Includes the relocated Slice-1
  suites (content-typings parity + the 2 new per-file-precedence tests; the TKT-288 tripwires; the
  dual-commissioning `type_document_text()` unit tests).
- **Materialization:** `python scripts/checks/check-engine-materialized.py` — **PASS (2 targets)**;
  canonical == parser copy == ocr copy (byte-identical), so the classifier change is present in both
  deployed Function Apps.
- **Real-corpus go/no-go (re-run against the re-homed engine):** `run_ab_parsefed.py` over the
  labelled corpus — **OLD 51/58 (87.9%) → NEW 53/58 (91.4%), 0 regressions, 2 improvements**
  (`tkt023-original-reply`, `tkt032-pcd-diminution`) — reproduces the saved baseline EXACTLY. The
  per-file-precedence correction (automated-review P1) adds correctness with no regression. See
  TKT-293's evidence for the full report.
- **Per-file-precedence branches unit-pinned:** report+instruction siblings →
  `existing_provider_instruction` (old aggregate would abstain to `other`); content-`instruction`
  under an `image` filename kind → promotes. The TKT-288 tripwires are unchanged (base behavior is
  byte-identical).
- `packages/domain`: `npx vitest run` — 32 files, 602 tests green (the `classification.ts` change is
  doc-comment only, now corrected to junk-only withdrawal).

## Pending / gaps

- OCR-dependent scanned-PDF content typings were not exercised in the local backtest run (no tesseract
  locally); the CI `engine` job installs tesseract. The aggregate still reproduced the baseline
  exactly, so no material effect on the go/no-go.
- The engine-merge branch's TKT-288 (backlog) will re-diff its 4 overlapping findings against this
  change when picked up — flagged in the tripwire test's docstring; no further action from this side.

## How to re-verify

- `cd services/engine/cedocumentmapper_v2 && python -m pytest tests -q` — expect 466 passed / 7 skipped.
- `python scripts/checks/check-engine-materialized.py` — expect PASS (2 targets).
- `cd packages/domain && npx vitest run` — expect 32 files / 602 tests green.
