# Process — Review 150726 (PR #100 `PLAN-006` repository reset)

> This folder is a **code-review record of PR #100**, captured in the `docs/reviews/` house format. It is
> not a user-authored requirements spec — where it states a requirement it is reporting the PR against
> PLAN-006's own locked decisions and the repo's machine-checked gates, not creating new spec.

## What was reviewed
- **PR #100** — `PLAN-006: reset repository structure and documentation`.
- Base `main`; head `origin/codex/plan-006-repository-reset` @ `ba675336`; merge-base `81ae8fdf`.
- Pre-reset **baseline snapshot** captured in commit `70a3bb57` under `.plan-006-baseline/` (removed from
  HEAD by design — "the checked-out tree contains no archive or pointer stubs").

## Method
1. **Isolated worktree, real gate reproduction.** The branch tip was checked out to a throwaway git worktree
   (`git worktree add --detach`), `npm ci` run, and the full offline gate suite executed locally — results in
   [`evidence/gate-battery.md`](./evidence/gate-battery.md). We **reproduce, not trust** the PR's summary.
2. **Audit the gates, not just their exit code.** For a Codex-generated reset, a green gate is only assurance
   if the gate is *meaningful*. Each lane was tasked to read the gate's implementation and judge whether it
   proves what it claims (e.g. does `check-runtime-contract` diff a frozen baseline or regenerate from HEAD?
   is `forbidden-signatures.json` actually populated?).
3. **Baseline diff for the load-bearing claims.** Runtime routes/DTOs/numeric-codes and the disposition ledger
   were diffed against `git show 70a3bb57:.plan-006-baseline/*` rather than trusting the current-tree contract.
4. **Ten-lane decomposition** (mapped to PLAN-006's 11 locked decisions, not to file count — most of the 3,006
   files are relocations proven mechanically): Wave 0 foundation/gates; Wave 1 highest-risk (reconciliation,
   docs, tickets, runtime-surface); Wave 2 mechanical (python/vendor, spa/database, agents/ci, purge/outputs).
5. **Adversarial verification.** Each Critical/Major finding was re-checked against the actual code/gate it
   hinges on before entering this report; unverifiable claims are marked PLAUSIBLE, confirmed ones CONFIRMED.

## Tools
- `git worktree` / `git show <ref>:<path>` / `git diff --stat` for read-only branch + baseline inspection.
- `node scripts/checks/*.mjs` and `scripts/maintenance/*.mjs` run directly in the worktree (dependency-light).
- `npm ci` + `node verify-all.mjs` in the worktree for the build/test gates.
- No live Azure calls — PLAN-006 performs no live writes and this review is offline-first.

## Staged verdict model (the branch is CONFLICTING / 57 behind main)
- **Stage 1 (this review):** assess approach, mechanism, invariant preservation, and gate soundness on the
  branch as-is — none of which depend on the exact rebased state.
- **Stage 2:** the author must rebase onto current `main` and resolve the 57-commit divergence (a hard
  pre-merge blocker; not the reviewer's job and not done here).
- **Stage 3:** a focused re-review of the rebased diff + green CI on the rebased tip gates final approval.

## How to read this folder
Start at [`overview.md`](./overview.md) → [`checklist.md`](./checklist.md) (the sign-off sheet, one row per
lane + the 11 locked decisions + the hard merge blockers). Each `<lane>/review.md` holds that lane's numbered
findings with severity and confidence. Objective gate output is in [`evidence/`](./evidence/).
