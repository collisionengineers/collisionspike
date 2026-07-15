# Changes — TKT-205: Make ticketed worktrees and offline checks the repository workflow

## Status
built — core lifecycle fixed and unit-tested offline; live create→publish→remove proof still PENDING

## Changes made

- Added the ticket worktree lifecycle command, direct-main pre-push guard, draft-PR template,
  retained-reference lifecycle note and read-only hygiene report.
- Added root offline-verification and hygiene commands, public local SPA settings, and an unconditional
  CI offline-verification job; removed the stale nested SPA lockfile.
- Declared TKT-205's tooling lane and TKT-206's runtime/schema lanes and component setup metadata.

## Post-review fixes (2026-07-15, from the PR #99 code review)

- **Blocker — `worktree.mjs create` crashed.** `create()` called `mkdirSync` which was never imported
  (ESM has no global `fs`), so it threw `ReferenceError: mkdirSync is not defined` every run. The call was
  also redundant (`active` always exists) and is now removed; `create` reaches `git worktree add` as intended.
- **`worktree.mjs remove`** now deletes the remote branch idempotently, so a branch already auto-deleted on
  merge no longer aborts removal after the local worktree/branch were dropped.
- **`worktree.mjs create`** dropped its dead `branch` parameter (the CLI never passed it); the standard
  `codex/tkt-NNN-slug` name is always derived.
- **`scripts/hooks/pre-push`** is now refspec-aware: it reads git's stdin ref updates and blocks any push
  targeting `refs/heads/main` (e.g. `git push origin HEAD:main`), with the original HEAD==main check kept as
  a fallback when stdin is empty.
- **`scripts/repository-hygiene.mjs`** expanded toward A9: direct-to-main commits, 7-day stale report /
  14-day blocking, branches lacking a PR/retention record (best-effort `gh`), an exclusive-lane ownership
  map, and orphan worktree config; `rev-parse main` is now non-fatal when no local `main` exists.
- **CI now actually runs the Python suites.** `.github/workflows/docs.yml` provisions each retained
  function's `.venv` (setup-python + locked-requirements install) before `npm run verify:offline`, so the
  pytest suites execute instead of skipping (A6). The verifier's skip text was corrected accordingly.
- **A10 tests added.** `scripts/worktree.test.mjs` + `scripts/pre-push.test.mjs` (10 `node:test` cases,
  isolated git fixtures, offline) cover the guard/rejection matrix, the `mkdirSync` regression, `remove`
  refusal, and the pre-push refspec block; wired in via the new `test:worktree-governance` npm script (which
  the root `test` script — and therefore `verify:offline` — now runs).
- **`raw/` committed** (separate commit) per the TKT-199 repository-data-authority ruling, which also
  restores a clean canonical checkout so `assertCanonical()`/hygiene no longer report it as dirty.

## Validation note

The ticket/documentation checks, authority tests, syntax checks and `worktree doctor TKT-205` pass.
`npm ci` in this newly-created Windows worktree hit an `ENOTEMPTY` cleanup failure under generated
`node_modules/@fluentui/react-icons`; therefore the build/test portion remains pending rather than
being represented as passing.

The first GitHub Actions run also showed npm omitting Rollup's Linux optional package after the stale
nested lockfile was removed. The unconditional offline job now installs that platform package explicitly
after root `npm ci`; the nested lockfile remains removed.
