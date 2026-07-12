# Changes — TKT-149: Require reciprocal Claude and Codex reviews on every pull request

## Status
implemented and offline-tested; live pull-request proof pending

## Hook wiring

- `.codex/hooks.json` now resolves every existing project hook from the active Git root on Unix and through `commandWindows` on Windows; the hard-coded `/home/alex/...` checkout is gone.
- `.claude/settings.json` now uses the documented `command` plus `${CLAUDE_PROJECT_DIR}` `args` form for every existing hook.
- `.codex/hooks/pr-review.mjs` and `.claude/hooks/pr-review.mjs` are thin origin-specific adapters over one runner.
- Known shell and GitHub-MCP create/ready/merge paths are intercepted. A canonical standalone `gh pr create` is rewritten; web/editor, compound, indirect, alias, global-option, path-qualified, REST/GraphQL and known MCP bypasses fail closed.

## Review runner

`scripts/hooks/reciprocal-pr-review.mjs`:

- creates every new request as draft, resolves the authoritative GitHub base/head commits, and snapshots the initiating checkout's branch, `HEAD` and full status;
- creates a unique detached worktree at the exact head without checkout, switch or `gh pr checkout`;
- forces Git long-path handling for detached checkout/removal on Windows and attempts verified cleanup if checkout fails part-way through;
- resolves trusted absolute executables outside the request checkout, including the Windows Codex npm entry point, before request code is read;
- runs reviewers from fresh empty child directories with secret-like environment variables removed, preventing request-controlled executable shadowing;
- runs Claude first with `--safe-mode -p`, no session persistence/Chrome/custom hooks, `dontAsk`, scoped Read, one temporary review-body Write, and one exact `gh pr comment --body-file` proxy command;
- runs Codex second in ephemeral, hooks-off, user-config/rules-ignored, read-only review mode and publishes its separate outcome;
- supplies every per-commit patch plus the aggregate diff and rejects changes-requested output without a priority and valid path/changed-hunk line;
- omits raw binary patch bytes while retaining binary paths/statistics, caps text context at 8 MiB, and streams the complete trusted bundle to both reviewers over stdin instead of making them page it through tool calls;
- updates each reviewer's exact existing comment ID, never `--edit-last`, and binds the visible-body digest/outcome to the full base and head IDs;
- rechecks GitHub revision before and after each stage, restarts a bounded number of times when it changes, and leaves the request draft on any failure;
- writes commit status `reciprocal-pr-review/head`, restores ready state only when requested and both outcomes pass, and gates later standalone ready/merge commands on those current markers;
- reconstructs immediate merge commands against the authoritative request URL with `--match-head-commit`, while refusing cross-repository targets, auto-merge, administrative bypass and branch deletion;
- supports `review-existing --repo OWNER/REPO --pr N` for every new pushed head; and
- enforces four-minute reviewer timeouts inside one nine-minute workflow deadline, recovers dead-process locks without stealing a live lock, verifies sentinel/containment ownership before recursive cleanup, and proves the caller checkout is unchanged.

## GitHub backstop

- `.github/scripts/review-marker-status.mjs` is the single canonical marker parser/evaluator.
- `.github/workflows/reciprocal-ai-review-markers.yml` never checks out or executes request-head code. It loads the evaluator from the trusted base commit, writes pending first, and then writes success/failure to the exact current head. Base retargeting and `main` pushes recalculate open requests.
- The current private GitHub Free repository cannot make this status a required branch-protection/ruleset check. The visible status and local ready/merge gate are implemented; browser/manual merge prevention remains externally gated on a plan that supports required checks.

## Documentation and tests

- `docs/PR-REVIEW-GUARD.md` records normal use, refresh after pushes, failure recovery, security boundaries and the honest GitHub-plan limitation.
- `npm run test:pr-review-hooks` runs the runner and canonical marker suites.
- The fixture suite covers hook schemas, unrelated-command fail-open behavior, wrapper/REST/GraphQL/MCP bypasses, forced-draft semantics, strict target parsing, atomic merge arguments, Windows-safe executable resolution, Claude permission paths, reviewer timeouts, per-commit context, order/outcomes, exact revision/digests, comment IDs, caller state, live/stale locks, ready-state races, head changes and safe cleanup. The final count is recorded in `verification.md` after the implementation freeze.
