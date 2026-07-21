# Verification — TKT-292: /classify-email route + functions-client.ts wiring (PLAN-014 Slice 2)

## Verdict
TESTED-OFFLINE

## Evidence

- `services/functions/parser`: `python -m pytest tests/test_email_classifier_route.py -q` —
  **17 passed** (incl. the 3 added strict-validation tests: unsupported `open_case_ref_match`
  state, malformed `{}` typing entry, unsupported `doc_type`). Full parser suite green in CI.
- `services/orchestration`: `npx vitest run` — **54 test files, 594 tests, all green**
  (this branch stacks on Slice 1/TKT-291, not Slice 0/TKT-290 — the 9-test difference vs.
  Slice 0's 603-test run is exactly Slice 0's own 11 new tests minus these 2 new ones, not a
  regression; Slice 0 and Slice 1/2 are independent branches off `main`, per PLAN-014's
  slicing).

## Pending / gaps

None for this slice's own scope. Nothing calls these fields with a real value yet — that
begins in Slice 4a, which is where their actual effect on real orchestrator behavior gets
tested.

## How to re-verify

- `cd services/functions/parser && python -m pytest -q` — expect 401 passed / 19 skipped.
- `cd services/orchestration && npx vitest run` — expect 54 files / 594 tests green (on this
  branch's lineage; will be higher once merged behind Slice 0).
