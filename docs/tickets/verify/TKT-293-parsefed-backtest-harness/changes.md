# Changes — TKT-293: Parse-fed backtest harness — the go/no-go gate (PLAN-014 Slice 3)

## Status
coded, offline-verified — awaiting PR review/merge

## What changed

- `scripts/evaluation/email/run_eval.py` — new `load_email_attachment_bytes()` (shared
  loader; returns real attachment name+bytes pairs).
- **New** `scripts/evaluation/email/run_ab_parsefed.py` — the OLD-vs-NEW backtest script.
- **New** `scripts/evaluation/email/tests/test_run_ab_parsefed.py` — 3 tests exercising
  the new loader addition and `compare_item()` against real corpus items.
- **New** `docs/tickets/now/TKT-293-parsefed-backtest-harness/evidence/parsefed-backtest-report.md`
  — the actual go/no-go report (zero regressions, 2 improvements, 87.9% → 91.4%).
- `packages/domain/src/domain/triage-policy.test.ts` — new ADR-0010 pin test (see ticket
  body).
- (Follow-up, landed in TKT-291's own PR, not here) — 2 fixes to TKT-291's D4 build that
  this backtest's first real run found necessary.

## Review fixes (automated-review, addressed)

Rebased onto the engine-consolidated main. Three go/no-go-integrity fixes to
`run_ab_parsefed.py`:

- **Propagate parser infrastructure failures** — `_derive_content_typings` no longer swallows
  ALL exceptions. A per-document client fault (`DocumentUnreadableError`/`ValueError` — image-only /
  unreadable / unsupported) is still skipped (matching the live per-document degrade), but a
  `ParserError` (missing engine dependency / engine crash — a 500 in production) now PROPAGATES and
  aborts the gate, so a broken parser environment can never falsely certify "0 regressions".
- **Match the live candidate set** — new `_order_parse_candidates()` mirrors
  `parse.ts`'s `orderParseCandidates().slice(0, MAX_PARSE_DOCS)` (docs only, Word/RTF before PDF,
  email files last-resort, capped at 3), so the harness never derives a typing from an attachment
  the live intake would never parse (e.g. the tkt051 sample's 4th document). +4 unit tests.
- **Fail the gate on skipped tracked items** — `--fail-on-regression` now returns 1 if ANY tracked
  item was skipped (a skip can hide the sole regression; matches the evaluator README's
  missing-evidence rule).
- Bumped the `triage-policy.test.ts` source-size ratchet 829 → 853 (its ADR-0010 pin grew the file).
- Registered `plan: PLAN-014`.

Backtest re-run after the fixes reproduces the same result: **58 compared, 0 skipped, 0 regressions,
2 improvements, 87.9% → 91.4%** — the candidate-cap correction did not change the go/no-go outcome.

## What did NOT change

`classify_email()`'s own signature/logic (TKT-291's scope). No orchestrator code —
Slice 3 is offline tooling only, no live behavior change. The corpus itself is
unchanged (no fabricated manifest entries — see the ticket body's honest scope note).
