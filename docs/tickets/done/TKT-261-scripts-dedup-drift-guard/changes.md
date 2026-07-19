# Changes — TKT-261: Guard scripts and tooling deduplication

## Status
verify — implemented on branch `plan010/scripts-dedup` (commit that adds check-scripts-dedup.mjs).

## Files added / changed
- `scripts/checks/check-scripts-dedup.mjs` — the AST single-source drift guard
- `scripts/checks/check-scripts-dedup.test.mjs` — 7 unit tests
- `scripts/checks/fixtures/scripts-dedup/{reimplemented-hash-core,duplicate-generated-directory-policy}.fixture.mjs`
- `verify-all.mjs` (line 66) + `package.json` (`check:scripts-dedup`) — wiring

## Summary
Adds the standing guard that keeps PLAN-010's shared internals single-source: the inventory content-hash
core must be imported (not re-implemented) and the generated-directory policy must be defined once. Passes
the current tree; fails a synthetic re-implemented hash core or duplicated generated-directory policy; wired
into `verify-all.mjs`. This is PLAN-010's terminal drift guard.
