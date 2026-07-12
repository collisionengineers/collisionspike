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
- sanitizes any copied wrapper-marker literal from either model before validation/publication, while telling Codex not to reproduce marker text from the untrusted diff;
- treats the latest trusted marker claim as authoritative even when its digest is invalid, orders duplicate claims by immutable creation time, and creates a replacement comment instead of overwriting an unscoped malformed human comment;
- posts new marked comments from an owned Markdown payload file and updates exact comment IDs from an owned JSON `--input` payload, keeping bodies up to 60 KB out of Windows process arguments;
- rechecks GitHub revision before and after each stage, restarts a bounded number of times when it changes, and leaves the request draft on any failure;
- writes commit status `reciprocal-pr-review/head`, restores ready state only when requested and both outcomes pass, and gates later standalone ready/merge commands on those current markers;
- reconstructs immediate merge commands against the authoritative request URL with `--match-head-commit`, while refusing cross-repository targets, auto-merge, administrative bypass and branch deletion;
- supports `review-existing --repo OWNER/REPO --pr N` for every new pushed head; and
- enforces six-minute Claude and three-and-a-half-minute Codex limits inside one 9½-minute workflow deadline, tells the stdin-complete Codex reviewer not to spend that bound re-reading the bundle through shell tools, raises the parent Claude Bash call to its documented ten-minute maximum, recovers dead-process locks without stealing a live lock, verifies sentinel/containment ownership before recursive cleanup, and proves the caller checkout is unchanged.

## GitHub backstop

- `.github/scripts/review-marker-status.mjs` is the single canonical marker parser/evaluator.
- `.github/workflows/reciprocal-ai-review-markers.yml` never checks out or executes request-head code. It loads the evaluator from the trusted base commit, writes pending first, and then writes success/failure to the exact current head. Base retargeting and `main` pushes recalculate open requests.
- A malformed pull number on a base-branch push now fails that item and continues evaluating the remaining open requests instead of returning from the whole batch.
- A newer malformed or digest-invalid trusted claim now fails closed instead of falling back to an older pass marker.
- The current private GitHub Free repository cannot make this status a required branch-protection/ruleset check. The visible status and local ready/merge gate are implemented; browser/manual merge prevention remains externally gated on a plan that supports required checks.

## Documentation and tests

- `docs/PR-REVIEW-GUARD.md` records normal use, refresh after pushes, failure recovery, security boundaries and the honest GitHub-plan limitation.
- `npm run test:pr-review-hooks` runs the runner and canonical marker suites.
- The fixture suite covers hook schemas, unrelated-command fail-open behavior, wrapper/REST/GraphQL/MCP bypasses, forced-draft semantics, strict target parsing, atomic merge arguments, Windows-safe executable resolution, Claude permission paths, reviewer timeouts, per-commit context, marker sanitization, order/outcomes, exact revision/digests, comment IDs, caller state, live/stale locks, ready-state races, head changes and safe cleanup. The final count is recorded in `verification.md` after the implementation freeze.

## Review disposition

- Claude's `.claude/settings.json` exec-form concern was checked against the official Claude hooks reference: `command` plus `args` is the documented direct-spawn form, and placeholders are substituted inside every argument. A fresh non-safe-mode Claude 2.1.202 session loaded the project settings, ran a Bash call through the project hooks, returned `v24.14.0`, and exited 0.
- Codex's concern that `Edit(...)` would not authorize Claude's Write tool is disproved by the exact live review that created `claude-review.md` and posted the Claude marker through the constrained command. Claude's permission rules intentionally use `Edit(...)` as the scoped file-editor rule.
- Codex's later concern that Claude ignores `PreToolUse.updatedInput` conflicts with the current [Claude hooks reference](https://code.claude.com/docs/en/hooks#pretooluse-decision-control), which explicitly states that `updatedInput` replaces the tool's entire argument object when returned with `permissionDecision: allow`. A fresh Claude process then proved the live rewrite: `gh pr ready 999999` became the runner's `gate --origin claude ...` command with a 600,000 ms timeout before execution. No code change was made for that false finding; a Claude-origin PR remains the final creation-path proof.
- Claude's base-push loop finding was accepted and fixed.
- Claude's non-blocking note about `pulls.get` sitting outside the per-request `try` was accepted: each open request is now isolated so a transient metadata lookup failure is reported and the remaining batch continues.
- Codex's Windows command-line finding on the 60 KB review-body allowance was accepted: both new-comment and PATCH paths now pass owned payload files rather than body text in argv.
- Claude's findings on copied marker literals and unscoped malformed-comment reuse were accepted: both reviewer bodies now pass through one sanitizer, and unscoped invalid claims force a new wrapper comment without overwriting the source comment.
- Codex's broad `createPullRequest` substring finding was accepted: ordinary repository searches now pass through, while direct and nested GitHub GraphQL mutations remain denied.
- Codex's later claim that the Codex-origin rewritten Bash call needs a Claude-style `timeout` input was rejected against the official [Codex Hooks reference](https://learn.chatgpt.com/docs/hooks#pretooluse): Codex documents Bash `tool_input` and rewritten `updatedInput` with the single string `command` field; the `timeout` documented elsewhere configures the hook handler in seconds, not the rewritten shell call. The Codex hook fixture intentionally asserts that no unsupported Claude milliseconds field is emitted.
- Claude's POSIX backslash and static prompt-delimiter findings were accepted: LF/CRLF continuations and escaped command words are normalized for detection, while each reviewer receives an unpredictable context boundary that the submitted diff cannot pre-close.
- Codex's executable-symlink and dynamic-shell findings were accepted: candidate paths and the repository boundary are realpath-canonicalized, and the demonstrated variable/default/IFS, ANSI-string and simple `printf` constructions are covered by fail-closed fixtures.
- Claude's default-test and benign marker-quotation findings were accepted: `npm test` now includes the deterministic guard suite, local CLI launch smoke tests skip only when those optional tools are unavailable, and malformed comments without a wrapper heading/reviewer claim do not shadow valid reviews.
- Codex's final empty-input and over-broad sequence findings were accepted: both adapters now turn empty, malformed, incomplete, partial and timed-out hook events into an explicit deny response instead of relying on a non-zero hook failure, while recognized literal inspection commands may quote guarded command text without executing it. Follow-up adversarial probes added launcher, quoted-shell, `rg --pre`, and PowerShell expression coverage so those executable forms remain denied.
- Codex's follow-up dynamic-command finding was accepted: variable-built GitHub/PR command identities combined with guarded create/ready/merge actions now fail closed, while unrelated shell composition and the narrow literal-inspection exception remain available.
