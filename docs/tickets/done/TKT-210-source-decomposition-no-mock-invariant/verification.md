# Verification — TKT-210: Decompose source by feature and enforce the production-data boundary

## Verdict
TESTED (offline) — the reopening reason (oversized ratcheted modules, A2) is closed. Ready for
verify → done in the PLAN-006 close-out, where TKT-214's aggregate gate samples every member.

## Evidence (2026-07-19, branch `plan006/tkt-210-source-decomposition`)
- **A2 complete.** All eleven previously-ratcheted files decomposed below 800 nonblank lines;
  `scripts/checks/source-size-budget.json` ratchets = `{}`. `npm run check:source-size` passes for 938
  owned source files with 0 ratchets. The extracted sibling modules range 41–791 nonblank; none exceeds
  the limit.
- **A1 / A7 feature ownership.** Each oversized file was split along cohesive responsibility boundaries
  with one clear owner per module (route registrar vs. handler vs. persistence helper vs. types), and
  test suites were relocated alongside their implementations (merge-routes.harness.ts, retro-create.test.ts,
  the split capture tests). The independent feature-ownership review required by the prior verify note was
  performed as an 8-reviewer adversarial pass (one per decomposed file).
- **A3 behaviour preserved.** `npm run check:runtime-contract` is byte-identical before and after every
  commit: 191 routes, 56 DTO declarations, 7 JSON schemas, 65 Postgres tables, 22 numeric code tables.
  The adversarial review returned **0 high/medium findings across all eight files**; every moved
  method/handler/route body diffed byte-identical to its pre-decomposition original (e.g. data-api's 63
  method bodies; the mergeCases / retro-create / capture handler blocks). The only findings were
  low-severity and confirmed behaviour-neutral: additive `export` keywords on newly-relocated helpers, a
  relocated `reconcileMergeArchiveHolding`/retro-case exports with no external importers (grep-verified),
  a single verified `ProviderArchivePendingError` class identity (fail-close preserved), and one type-only
  `publicStatus` annotation change.
- **A4 no-mock boundary holds.** `check:production-dependencies` PASS across 9 entrypoint graphs, 506
  modules, 2315 dependency edges — zero mock/sample/demo/seed/fixture/evaluation imports on any
  production-reachable path.
- **A8 all scopes green (clean run 2026-07-19).** domain 594, data-api 1102, orchestration 573, web 556
  tests; box-webhook pytest 285; plus every verify-all structural gate: layout, inventory, reconciliation,
  evidence catalogue, image-review parity, decoded binary-content, generated adapters, doc-links, ticket
  parity, data-authority, database code-table parity, and the parser vendor pin.
- **A9 no live write.** The decomposition is source-only; no deployment, cloud, mailbox, or database
  mutation was performed.

## Pending / gaps
- None for A2/A3/A4/A7/A8/A9. The final status transition (verify → done) is recorded under the PLAN-006
  close-out, where TKT-214 independently samples every plan member.

## How to re-verify
From a clean checkout on the branch: `npm run check:source-size` (0 ratchets), `npm run check:runtime-contract`
(191 routes unchanged), `npm run check:production-dependencies` (9 graphs / 506 modules), the four package
suites + `python -m pytest services/functions/box-webhook`, and diff each decomposed file's moved blocks
against `git show main:<file>`.
