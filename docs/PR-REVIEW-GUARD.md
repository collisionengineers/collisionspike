# Pull-request review guard

Every pull request must receive two exact-revision reviews before it is made ready or merged:

1. Claude Code runs first in non-interactive mode (`claude -p`) and posts its own GitHub comment through a constrained `gh pr comment` proxy.
2. Codex runs second in non-interactive, ephemeral, read-only review mode and the runner posts its separate comment.

Both comments bind to the pull request's full base and head commit IDs, include a digest of the visible review body, and declare either `pass` or `changes-requested`. A passing marker for an older commit is never accepted for a newer head.

## Normal use

Prerequisites are authenticated `gh`, `claude`, and `codex` CLIs plus Node 20 or later. Claude uses its existing OAuth/keychain login; the runner does not use bare mode or require an API key. On Windows, the runner resolves the npm-installed Codex JavaScript entry point directly so it never asks `cmd.exe` to execute an npm shim.

From Codex or Claude, create the pull request with one standalone non-interactive command:

```powershell
gh pr create --title "Title" --body "Body" --base main
```

The project `PreToolUse` hook rewrites that command to the shared runner. The runner:

- records the caller's branch, `HEAD`, and complete working status;
- creates the pull request as a draft even when a ready pull request was requested;
- resolves the authoritative pull-request base/head from GitHub;
- reviews a detached temporary worktree at that exact head without checkout, switch, or `gh pr checkout`;
- resolves trusted Git, GitHub CLI, Claude, Codex and Node executables outside the repository before it reads request code;
- runs each reviewer from a new empty child directory, with secret-like environment variables removed, so request files cannot shadow a trusted executable;
- gives Claude read access to the worktree/context plus write access to one temporary review file, then permits one exact `gh pr comment … --body-file` command;
- gives both reviewers every per-commit patch and the aggregate diff, validates each changes-requested finding's priority/path/changed-hunk line, and verifies both GitHub comments;
- writes the `reciprocal-pr-review/head` commit status;
- makes the pull request ready only when the original command was not `--draft` and both outcomes pass; and
- verifies the initiating checkout is byte-for-byte unchanged in branch, head, and status.

Web/editor, compound, piped, path-qualified, API/GraphQL, cross-repository, alias, auto-merge and known GitHub MCP mutation paths are refused because they cannot guarantee the synchronous sequence. Immediate merges are reconstructed against the resolved PR URL and include `--match-head-commit` for the reviewed head; administrative bypass, auto-merge and branch deletion are refused.

After this file or either hook configuration changes, start a fresh Codex/Claude session and approve the repository trust prompt so the project hook is loaded. Project `PreToolUse` hooks do not govern commands run from an unrelated terminal or every possible external integration; use the checked-in runner directly when outside an agent session. The GitHub status backstop covers PR events and base-branch changes, subject to the plan limitation below.

## Review a new head

Every pushed commit invalidates the old markers. Re-run both reviews against an existing pull request with:

```powershell
node scripts/hooks/reciprocal-pr-review.mjs review-existing --repo collisionengineers/collisionspike --pr 123
```

If the pull request was ready, this temporarily returns it to draft and restores ready state only after both reviews pass. Reviewer comments are updated by their exact comment IDs; the runner never uses `--edit-last`.

Standalone `gh pr ready` and `gh pr merge` commands are also routed through a current-head marker gate. Missing, stale, tampered, or changes-requested reviews fail closed.

A same-head retry preserves each existing attestation, including changes-requested, so review outcomes cannot be retried away without a code change. A pushed commit invalidates both earlier markers and requires both reviewers again.

## Failure and recovery

A missing CLI/auth session, four-minute per-reviewer timeout, nine-minute workflow deadline, head change, malformed outcome, invalid changed-line citation, absent comment, unsafe cleanup target, or failed status update stops the command and leaves the pull request in draft. Fix the underlying problem or findings, push a new commit, and run `review-existing` again.

The runner uses only uniquely owned temporary directories with sentinels and exact-head detached worktrees. Locks include process/age ownership and recover after a dead or timed-out process. It never changes the initiating branch.

## GitHub backstop and current limitation

`.github/workflows/reciprocal-ai-review-markers.yml` is API-only: it never checks out or executes pull-request code. It reloads the evaluator from the trusted base commit, evaluates both current-head comments, and writes a pending then success/failure status to the exact head. It recalculates when a request is retargeted and whenever `main` advances so an old-base success does not remain current.

The workflow first becomes active after the PR that introduces it is merged into the default branch. That bootstrap PR is protected by the local exact-head runner and its directly written status, then subsequent PRs receive both layers.

This private repository is currently on GitHub Free, where branch protection/rulesets cannot make that status required. The workflow therefore provides visible current-head failure while the local ready/merge guard is the enforceable agent path. A browser/manual merge remains technically possible until the repository plan supports requiring `reciprocal-pr-review/head`; that limitation must not be described as resolved.

Both comments are currently posted through the repository owner's authenticated GitHub CLI identity. The digest protects the visible review text from accidental or later edits, but it is not a cryptographic proof that a particular model authored the text because a repository owner could construct the same marker. Strong author attestation would require separate Claude/Codex GitHub App identities or signed attestations; the current guard is an auditable workflow control, not an identity-security boundary.

## Sources

- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [GitHub Actions event security](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
