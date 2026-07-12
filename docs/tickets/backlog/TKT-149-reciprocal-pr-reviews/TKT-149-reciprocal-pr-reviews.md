---
id: TKT-149
title: Require reciprocal Claude and Codex reviews on every pull request
status: backlog
priority: P0
area: platform
tickets-it-relates-to: [TKT-074, TKT-114]
research-link: docs/tickets/backlog/TKT-149-reciprocal-pr-reviews/evidence/operator-note.md
plan: PLAN-004
---

# Require reciprocal Claude and Codex reviews on every pull request

## Problem
Pull requests can currently be opened by Codex or Claude without an enforced independent model review. The existing Codex hook file also contains machine-specific Linux paths, so some repository guard hooks are not portable to this Windows checkout.

## Evidence
- [Operator note](./evidence/operator-note.md) — every PR must be reviewed by the other coding agent and the result must appear on the PR.
- `.codex/hooks.json` — current Codex lifecycle configuration.
- `.claude/settings.json` — current Claude lifecycle configuration.

## Proposed change
PROPOSED (not built): add reciprocal synchronous PR-creation hooks backed by one tested shared runner. Reviews execute at the exact PR head in a detached temporary worktree, post or update a marked PR comment, and stop the originating agent visibly if review or comment publication fails.

## Acceptance
- A PR created from Codex through standalone `gh pr create` or the installed GitHub create-pull-request tool synchronously runs `claude -p` against the exact PR head before Codex continues.
- Claude uses narrowly allowed read-only Git/GitHub commands plus `gh pr comment` to post or update one top-level review comment on the PR; the comment is present even when no findings are reported.
- A PR created from Claude through standalone `gh pr create` or a GitHub create-pull-request tool synchronously runs non-interactive Codex review against the exact PR head and publishes one marked top-level review comment.
- Reviews inspect the aggregate diff, individual commits, and relevant changed lines; actionable findings include severity, path, and a valid changed-line location.
- The runner creates a uniquely named detached temporary worktree at the authoritative head SHA. It never calls `git checkout`, `git switch`, or `gh pr checkout`, and proves the caller's branch, HEAD, and worktree status are unchanged before and after.
- A reviewer/head marker makes retries and concurrent hook invocations idempotent. A new PR head SHA triggers a fresh review and updates the existing reviewer comment rather than duplicating it.
- Recursion is prevented when the opposite CLI starts; Claude retains its existing OAuth/keychain authentication and does not use bare mode.
- Reviewer timeout, unavailable CLI/auth, malformed output, invalid line citation, unsafe worktree path, or missing GitHub comment stops the originating agent with a visible reason. Unrelated tool calls fail open.
- Compound, backgrounded, piped, and `--web` PR-create commands are rejected with a safe standalone-command instruction so the review cannot be bypassed accidentally.
- A GitHub-required check fails closed when either reviewer marker is absent on the current head, covering PRs opened outside Codex/Claude even though local lifecycle hooks cannot run in a browser or unrelated terminal.
- Existing Azure and Box guards continue to run, use portable repo-root resolution on Windows and Unix, and pass their current fixture tests.
- Fixture-based tests cover shell and MCP detection, response parsing, locking, deduplication, exact-SHA worktrees, cleanup on every failure, permission arguments, comment create/update, and caller-state preservation.
- Live proof opens draft PRs through both agent paths, records exactly one current-head comment from each reciprocal reviewer, and confirms no branch change or dirty-file change in the initiating checkout.

## Research
Distilled 2026-07-12 from the operator request plus the official Claude headless/CLI/hooks documentation and official Codex hooks documentation.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
