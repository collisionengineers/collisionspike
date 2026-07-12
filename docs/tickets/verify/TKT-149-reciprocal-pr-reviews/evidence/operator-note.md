# Operator note — reciprocal PR review

Whenever a PR is submitted from Codex, run Claude Code non-interactively (`claude -p`) first and have Claude publish its detailed review on the PR with GitHub CLI. When a PR is submitted from Claude, run Codex non-interactively for the reciprocal review. The hooks must apply every time without switching or disturbing another worker's branch, and PRs must also receive a separate Codex review before merge.

Official references supplied/consulted:
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/hooks
- https://learn.chatgpt.com/docs/hooks

