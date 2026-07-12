# Verification — TKT-149: Require reciprocal Claude and Codex reviews on every pull request

## Verdict
TESTED (offline) — live draft-PR proof is pending.

## Evidence

- `npm run test:pr-review-hooks` — PASS, 41/41 on 2026-07-12. Coverage includes Windows production launch, Claude `//drive` permission rules, timeouts, live/stale locks, wrapper/API/MCP bypasses, merge SHA binding, forced draft, per-commit bundles, ready-state races and current-head outcomes.
- `node --check` — PASS for the shared runner, both hook adapters and marker evaluator.
- Both hook configuration files parse as JSON.
- The Codex `commandWindows` Git-root resolver was exercised from `mockup-app/`; it found the root adapter and returned the expected `updatedInput` rewrite.
- Workflow YAML parses and the evaluator's data-URL import path was fixture-smoked.
- `gh auth status`, `claude auth status`, and `codex login status` confirm all three required CLIs are currently authenticated.
- The Windows production resolver launches Codex through its npm JavaScript entry with `shell:false`; `codex-cli 0.144.0` returned successfully where the `.cmd`/WindowsApps launch paths returned `EPERM`.
- Exact no-GitHub CLI preflights passed for Claude 2.1.202 scoped Read/Edit plus the constrained body-file command, and for locked-down plain `codex exec` after the installed `exec review` subcommand rejected a custom prompt.
- Bootstrap draft [PR #60](https://github.com/collisionengineers/collisionspike/pull/60) was created by the runner. Its first review attempt stopped before either model after Git hit an existing over-260-character evidence path; the request remained draft with zero review comments. The runner now forces `core.longpaths=true`, and a real exact-head detached checkout/removal of all 2,856 files passed locally. Reciprocal live comments remain pending on the corrected head.

## Pending / gaps

- Open a real draft via the runner, then independently inspect both exact-head GitHub comments, outcome/digest markers, status and initiating checkout invariants.
- Push a new commit and prove the old markers fail until `review-existing` refreshes both.
- Open a second disposable draft through the Claude hook path to prove its adapter outside the fixture harness.
- GitHub's current private-Free plan rejects branch protection/rulesets, so `reciprocal-pr-review/head` cannot yet be configured as a required server-side merge check. Local agent ready/merge commands fail closed; browser merge remains a documented platform limitation.
- Both reviews currently use the repository owner's authenticated GitHub identity. Marker digests detect text edits but do not cryptographically prove which model authored a comment; separate GitHub App identities or signed attestations would be required for that stronger property.

## How to re-verify
Run the fixture suite, then open one draft PR through Codex and one through Claude. Confirm both reciprocal current-head comments, the visible exact-head status, and unchanged initiating branch/HEAD/status.
