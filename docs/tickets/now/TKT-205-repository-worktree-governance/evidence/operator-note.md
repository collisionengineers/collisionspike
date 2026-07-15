# Operator note — 2026-07-14

The attached “Collisionspike worktree, branch, and remote recovery” plan requires a permanent repository workflow: a clean canonical `main` checkout; ticketed `codex/tkt-NNN-slug` branches and draft PRs; at most three feature worktrees; exclusive `runtime`, `schema` and `evidence` lanes; no shared stash or direct `main` pushes; safe create/adopt/status/doctor/publish/remove tooling; always-running offline verification; and weekly read-only hygiene reporting. The complete command contract and acceptance tests are in the user-supplied plan attached to this task.
