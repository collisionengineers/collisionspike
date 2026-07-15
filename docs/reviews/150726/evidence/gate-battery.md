# Evidence — offline gate battery (reproduced locally)

Reproduced on the branch tip (`ba675336`) in an isolated worktree after `npm ci`. Every offline gate the
reset ships **passed**. This is the objective floor; the lane reviews audit whether each gate is *meaningful*.

## Structural / doc / reconciliation gates (no build required)

| Gate (script) | Result | Reported detail | Locked decision |
|---|---|---|---|
| `check:layout` (check-repository-layout.mjs) | PASS | 2889 tracked paths | #1 locked structure |
| `check:runtime-contract` (check-runtime-contract.mjs) | PASS | 158 routes, 49 DTO decls, 7 JSON schemas, 52 Postgres tables | #7 surface invariance |
| `check:production-dependencies` (check-production-dependencies.mjs) | PASS | 9 entrypoint graphs, 457 modules, 2045 edges | #8 no fixtures in prod |
| `check:forbidden` (check-forbidden-references.mjs) | PASS | **"No configured signatures found."** ⚠️ audit for vacuity | TKT-211 purge |
| `check:source-size` (check-source-size.mjs) | PASS | 800 owned source files (limit 800 nonblank lines) | source decomposition |
| `check:tracked-outputs` (check-tracked-outputs.mjs) | PASS | — | generated-output removal |
| `check:docs` (check-doc-links.mjs) | PASS | 1089 tracked markdown files | doc links/orphans/leakage |
| `check:tickets` (check-tickets.mjs) | PASS | OK | #2 ticket authority |
| `check:data-authority` (check-repository-data-authority.mjs) | PASS | — | repo data authority |
| `check:image-review` (check-image-review.mjs) | PASS | 294 unique blobs (136 OCR-reviewed, 158 non-doc case photos) | evidence review parity |
| `check:adapters` (generate-agent-adapters.mjs --check) | PASS | 15 roles, 10 skills | #9 canonical→generated |
| `check:evidence` (evidence-catalog.mjs check) | PASS | 550 logical usages, 533 unique blobs, 17 duplicate occurrences | #5 evidence manifest |
| `check:inventory` (generate-repository-inventory.mjs --check) | PASS | 903 directories, 2889 files | TKT-207 ledger |
| `check:reconciliation` (reconcile-repository-reset.mjs) | PASS | **3268 baseline files → 2889 final, 0 unexplained** | #4 nothing-lost |
| `check:database` (database/tests/code-table-parity.mjs) | PASS | Database parity checks passed | DDL identifiers |
| `check:line-endings` (normalize-line-endings.mjs --check) | PASS | — | hygiene |

## Build / test gates
- `npm ci` — completed clean (exit 0).
- `node verify-all.mjs` — **34 passed, 0 failed.** TS builds + tests for @cs/domain, @cs/api, @cs/orchestration,
  @cs/web; all 6 Python suites (archive-webhook, eva-sentry, location-assist, ocr, parser, vehicle-enrichment)
  + the email-evaluation tests ran and PASSED; all structural/doc/reconciliation checks PASSED.

## The load-bearing caveat
Every gate above is computed on the **post-reset tree** and several are **self-referential** — they cannot
detect that the branch is 57 commits behind main and is missing #73/#83/#87/#89's tables/features (see
`spa-database/review.md`, `reconciliation/review.md`, `runtime-surface/review.md`). **Green ≠ complete.** The
`capture_session` / `archive_holding` / `evidence_deletion` / `mcp_http_session` tables were confirmed ABSENT at
merge-base `81ae8fdf` and present on `origin/main` — i.e. added after the base, and reverted by this branch.

## Notes for the lane audits
- `check:forbidden` printing *"No configured signatures found"* is the one gate output that reads as possibly
  vacuous — Lane H runs it down (`forbidden-signatures.json` populated vs empty).
- `check:runtime-contract` passing proves internal consistency of the current tree; Lane D determines whether
  it also diffs the **frozen** `70a3bb57` baseline (true invariance) or only regenerates from HEAD.
- `check:reconciliation` "0 unexplained" is path-level bookkeeping; Lane A determines whether "explained" also
  requires **content/hash preservation** or only accounts for path disposition.
