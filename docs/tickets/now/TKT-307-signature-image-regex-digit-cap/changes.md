# Changes — TKT-307

## Source

- `services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/rules/email_classifier.py` —
  `_SIGNATURE_IMAGE_RE` digit run widened from `\d{1,4}` to unbounded `\d+`.
- `python scripts/build/sync-engine.py` — re-materialized `services/functions/parser/` and
  `services/functions/ocr/` from the authoring source. Never hand-edited a materialized copy.
- `services/orchestration/src/workflows/intake/triagePolicy.ts` — TS twin `_SIGNATURE_IMAGE_RE`
  widened to match, in lockstep per its own comment.

## Tests

- `services/engine/cedocumentmapper_v2/tests/test_email_classifier.py` — new
  `test_six_digit_outlook_cid_signature_logo_is_not_delivered_evidence`, re-materialized to the
  parser/ocr test trees by the same sync run.
- `services/orchestration/src/workflows/intake/triagePolicy.test.ts` — new case for
  `image078315.png`.

Results: Python `test_email_classifier.py` 75 passed; `check-engine-materialized.py` PASS (2
targets); `@cs/orchestration` `triagePolicy.test.ts` 13 passed (full suite 649 passed).
