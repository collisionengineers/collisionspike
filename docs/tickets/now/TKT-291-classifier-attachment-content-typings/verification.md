# Verification — TKT-291: classify_email() gains attachment_content_typings (PLAN-014 Slice 1)

## Verdict
TESTED-OFFLINE

## Evidence

- `services/functions/parser`: `python -m pytest -q` — **396 passed, 19 skipped** (the 19 are
  pre-existing environment-dependent skips, unrelated to this change — confirmed present
  before this change too). Includes the new parity/behavior suite (6 tests) and the new
  TKT-288 overlap tripwire suite (4 tests).
- Manually probed all 4 TKT-288-overlap scenarios directly via `classify_email()` before
  writing the tripwire assertions, confirming each reproduces the exact bug shape its
  finding describes (receipt-confirmation cover note suppressed; new-work reply read as
  existing query; billing-only mail promoted via instruction kind; ambiguous provider
  treated as new client).
- `VENDOR_LOCK.json`'s offline check (`test_engine_vendored_in_sync.py` ->
  `verify_vendor_pin.py`, no `--sibling` — the check CI actually runs) passes with the
  updated `contentSha256`.
- `packages/domain`: `npx vitest run` — 32 files, 602 tests, all green (the `classification.ts`
  change is comment-only).

## Pending / gaps

The engine-merge branch's own TKT-288 (unmerged) will need to re-diff its 4 overlapping
findings against this change when it eventually lands — flagged in this ticket's Proposed
Change section and in the tripwire test file's own docstring; no further action possible from
this side (that branch is not mine to edit).

## How to re-verify

- `cd services/functions/parser && python -m pytest -q` — expect 396 passed / 19 skipped.
- `cd services/functions/parser && python scripts/verify_vendor_pin.py` — expect PASS
  (offline lock; no sibling clone needed).
- `cd packages/domain && npx vitest run` — expect 32 files / 602 tests green.
