---
name: governance-ledgers-stage-then-regenerate
description: "repository-inventory/reconciliation hash STAGE-0 INDEX blobs — stage sibling artifacts first, then regenerate; Windows regen is fine (blobs are LF-independent); never trust a working-tree-only regen"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0aa70cef-1137-4eea-aaa9-7f9073dea412
---

`docs/governance/repository-inventory.json` and `repository-reconciliation.json` hash
**stage-0 Git index blobs**, not working-tree bytes (the inventory's own `hashPolicy`
says so; its self-entry is null and `RECURSIVE_GOVERNANCE_ARTIFACTS` breaks the
reconciliation recursion). Two CI failures on 2026-07-17 came from ignoring this:
a Windows regen was blamed on CRLF (wrong theory — blobs are line-ending independent),
and a Linux-clone regen recorded the OLD reconciliation blob because the rewritten
ledger was never `git add`ed before the inventory ran.

**Why:** the generators read the index, so any sibling file regenerated-but-unstaged is
hashed at its previous committed content; the committed pair can then never verify on CI.

**How to apply:** converge in ONE commit with this order: regen inventory → `git add` it →
`reconcile-repository-reset.mjs --write` if stale → `git add` it → regen inventory again →
`git add` → both `--check`s green → commit. Platform is irrelevant; run it on Windows.
Also: direct pushes to collisionspike `main` are hook-blocked ("publish a ticket branch
and merge its pull request"), and check:source-size ratchets live in
`scripts/checks/source-size-budget.json`. See [[windows-parser-test-preexisting-failures]]
for the sibling class of environment-vs-truth lessons.
