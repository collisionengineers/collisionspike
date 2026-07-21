# Changes — TKT-292: /classify-email route + functions-client.ts wiring (PLAN-014 Slice 2)

## Status
coded, offline-verified — awaiting PR review/merge

## What changed

- `services/functions/parser/function_app.py` — `_classify_email` reads/validates/passes
  through `open_case_ref_match` and `attachment_content_typings`; docstring updated.
- `services/orchestration/src/adapters/functions-client.ts` — `callClassifyEmail` gains
  `openCaseRefMatch`/`attachmentContentTypings`, mapped to the wire's snake_case shape,
  both defaulting to empty when omitted.
- **New** `services/functions/parser/tests/test_email_classifier_route.py` additions (5
  tests): pass-through + validation-rejection for both new fields, plus an end-to-end proof
  that a content-typed report reaches `classify_email` through the full HTTP path.
- **New** `services/orchestration/src/adapters/functions-client.classify-email.test.ts` (2
  tests): default-empty-when-omitted, camelCase-to-snake_case mapping when provided.

## Review fixes (automated-review, addressed)

- **Strict per-field validation** (`function_app.py`): `open_case_ref_match` is now restricted to
  the classifier's own vocabulary `one | none | ambiguous` (a `matched`/`unmatched`/typo value 400s
  instead of being coerced to "no open case" — which could let an update mint a duplicate); each
  `attachment_content_typings` entry must carry a non-empty string `filename` and a `doc_type` in
  `instruction|report|junk|unknown` (a malformed `{}` or unsupported doc_type 400s instead of
  becoming a content-type set that could suppress a genuine instruction). +3 route tests.
- **TS client union** (`functions-client.ts`): `openCaseRefMatch` narrowed from `string` to
  `'one' | 'none' | 'ambiguous'`, matching the route.
- **Route docstring** corrected: `unknown` ABSTAINS (filename kind stands), only `junk` withdraws;
  typings reconciled PER FILE (matches the re-homed Slice-1 D4).
- Registered `plan: PLAN-014` on TKT-292.

Note: rebased onto the engine-consolidated main (Slice 1 now lands in canonical `services/engine`);
this slice's `function_app.py`/`functions-client.ts` are outside the materialized engine, so the
re-home did not affect them.

## What did NOT change

No orchestrator caller populates these fields yet (Slice 4a's job). `classify_email()` itself
is unchanged (TKT-291/Slice 1). Every other route field/behavior is unchanged.
