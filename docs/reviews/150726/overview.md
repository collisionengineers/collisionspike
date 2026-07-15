# Review 150726 — PR #100 `PLAN-006` repository reset (15 July 2026)

This folder is a **code-review record of PR #100** (`PLAN-006: reset repository structure and
documentation`), captured in the `docs/reviews/` house format. It is a review *of a pull request*, not a
user-authored requirements spec — read [`process.md`](./process.md) for method and the staged-verdict model.

## Verdict: **REQUEST CHANGES** — do not merge as-is

The reset's core structural work is, on inspection, **genuinely sound** — the public runtime surface is
provably invariant (modulo two disclosed deltas), the evidence relocation is lossless, and most gates are
meaningful. The offline gate battery reproduces green (34/34). **But two ship-blockers are invisible to that
green CI**, and the branch cannot merge in its current state. This is exactly the class of defect a
green-checkmark glance would miss and a multi-lane audit catches.

### Hard blockers (must clear before merge)
1. **[BLOCKER] Stale base → silent feature reversion.** The branch is **57 commits behind main** (merge-base
   `81ae8fdf`) and its whole-tree restructure does **not** contain the work merged after that base in
   **#73 / #83 / #87 / #89**: 5 tables (`capture_session`, `mcp_http_session`, `mcp_image_ingest_rate_limit`,
   `archive_holding`, `evidence_deletion`), the `case_.archive_holding_pending` column, audit codes
   100000056–100000065, the reference-corpus seed (`910_seed_corpus.sql`), 4 delta migrations, and 2 SPA
   feature components + their API routes. Confirmed absent at the merge-base. A naïve merge or "take-branch"
   rebase **reverts all of it**, and every gate misses it because the fixtures/snapshots/parity corpora were
   regenerated against the reduced tree. The rebase is therefore **not mechanical** — it must consciously
   re-apply 57 commits of feature work into the new layout, then this review must re-run (Stage 3). See
   [`spa-database/review.md`](./spa-database/review.md), [`reconciliation/review.md`](./reconciliation/review.md).
2. **[BLOCKER] TKT-207 / TKT-208 ID collision.** The branch's PLAN-006 `TKT-207`/`TKT-208` reuse IDs main
   already assigned to *different* tickets (PLAN-004 bulk-case-lock; MCP box-root). Different folder paths, so
   a merge keeps **both** → duplicate IDs on main with no guard; `check:tickets` passes because it only sees
   the branch's tickets. Renumber the PLAN-006 tickets (+ their relation graph) before merge.
   See [`tickets-board/review.md`](./tickets-board/review.md).
3. **[BLOCKER — pre-existing] `CONFLICTING` / no approving review.** `mergeable=CONFLICTING`,
   `mergeStateStatus=DIRTY`, `reviewDecision` empty (only a Codex bot comment). Resolved by clearing #1.

### Major (fix before merge, or record an explicit operator waiver)
- **M1 — the "nothing-lost" gate is false assurance.** `check:reconciliation`'s *0 unexplained* is tautological
  (labels every path, exempts deletes); it cannot detect a dropped or byte-corrupted file. The genuine
  semantic comparator (`.plan-006-baseline/compare.mjs`) was removed from HEAD and is not gated. This is *why*
  blocker #1 is invisible. [`reconciliation/review.md`](./reconciliation/review.md)
- **M2 — CI dropped the cross-repo parser vendor-source proof + verify-live.** `ci.yml` runs only the
  self-referential offline vendor pin; main's `parser-vendor-source` job (deploy-key checkout of the private
  authoring repo → immutable-tag proof) is gone, so a vendored-engine tamper that also rewrites `VENDOR_LOCK.json`
  passes CI. [`agents-ci/review.md`](./agents-ci/review.md)
- **M3 — precedence violations.** The reset deleted 33 annotated screenshots of binding review `190626/` and
  rewrote all 25 ADRs (ADR-0013 lost its 2026-07-08 image-based-prefill amendment + supersession records).
  Binding reviews and ADRs *outrank* a structural reset and are superseded "only by a later review". All
  git-recoverable, and much of 190626 is superseded prior-platform-era UI — but the live tree now records less
  than the binding originals. [`docs-integrity/review.md`](./docs-integrity/review.md)

### The rest
Medium/Minor findings (runtime-contract gate self-referential; vendored-file docstring edits vs ADR-0018;
stale PROVENANCE; removed `pre-push` hook; `gated.md` registry replaced; inert `skills-lock.json`; the
mislabeled forbidden-references message) are itemised per lane and in [`checklist.md`](./checklist.md).

### What is genuinely sound (verified — do not "fix")
Runtime surface routes/DTOs/numeric-codes independently baseline-diffed **clean**; evidence catalog lossless
(0/550 uses unmapped); `production-dependencies` a real AST graph (0 fixtures in prod); adapter generation a
proper canonical→generated model; `forbidden-references` genuinely populated (35 signatures); SPA move clean
(12 binary assets byte-identical, seam intact); parser vendor pin internally valid; surviving DDL preserves
all table names + numeric codes; `verify-all` 34/34.

## Lanes
| Lane | Area | Issues | Highest |
|---|---|--:|---|
| A | [Reconciliation & nothing-lost proof](./reconciliation/review.md) | 4 | Major |
| B | [Docs integrity & governance](./docs-integrity/review.md) | 4 | High (precedence) |
| C | [Tickets & BOARD](./tickets-board/review.md) | 4 | **Blocker** (ID collision) |
| D | [Runtime public-surface invariance](./runtime-surface/review.md) | 4 | Medium (surface itself clean) |
| E | [Python functions & vendor pin](./python-vendor/review.md) | 4 | Medium |
| F | [SPA + Migration/DDL moves](./spa-database/review.md) | 6 | **Blocker** (DDL reversion) |
| G | [Agent generation & CI subsumption](./agents-ci/review.md) | 5 | Major (vendor-source drop) |
| H | [Retired-platform purge & outputs](./purge-outputs/review.md) | 3 | Minor (red flag disproven) |

Start with [`checklist.md`](./checklist.md) for the sign-off sheet.
