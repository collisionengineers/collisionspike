---
id: TKT-205
title: Make ticketed worktrees and offline checks the repository workflow
status: now
priority: P1
area: platform
worktree-lanes: [tooling]
worktree-components: [node]
tickets-it-relates-to: [TKT-149, TKT-199]
research-link: docs/tickets/now/TKT-205-repository-worktree-governance/evidence/operator-note.md
plan: PLAN-004
---

# Make ticketed worktrees and offline checks the repository workflow

## Problem
The repository recovered cleanly, but it had no durable, enforced way to keep the canonical checkout on `main`, associate a branch with a ticket, prevent overlapping runtime/schema/evidence worktrees, or distinguish an offline failure from a credential-gated skipped check. Manual recovery procedures are not a safe day-to-day workflow.

## Evidence
- [Recovery-plan operator note](./evidence/operator-note.md) defines the canonical checkout, branch, lane, worktree, CI and hygiene rules to make permanent.
- The recovery proved that four simultaneously checked-out overlapping feature branches created avoidable structural conflict even when every checkout was clean.

## Proposed change
Build the governed worktree lifecycle and offline verification workflow specified in the operator note. It must be safe by default, preserve unmerged work, and make exceptions visible rather than silently deleting or hiding them.

## Acceptance
- **A1.** `node scripts/worktree.mjs init` configures the named hooks and Git defaults; `create`, `adopt`, `status`, `doctor`, `publish` and `remove` implement the documented lifecycle interface and give actionable failures.
- **A2.** Creation requires a clean, current canonical `main`, an active valid ticket, fewer than three feature worktrees, available lane locks and a standard `codex/tkt-NNN-slug` branch. It uses `git worktree add --no-track` from `origin/main`.
- **A3.** Ticket metadata declares worktree lanes/components. `runtime`, `schema` and `evidence` are exclusive across both local and known remote active branches; collisions, a fourth worktree and dirty/behind canonical state are rejected.
- **A4.** Creation is atomic. Any failed dependency install, doctor check or baseline test removes only the newly-created worktree/branch after resolved-path containment proves it is under the intended `active` directory.
- **A5.** Root-workspace setup uses root `npm ci`; the stale `mockup-app/package-lock.json` is removed; tracked development settings contain only public development identifiers and the local API base. Component-declared Python setup creates only the relevant virtual environment and uses locked requirements.
- **A6.** `npm run verify:offline` runs domain, API, orchestration and SPA builds/tests plus ticket/docs checks and relevant Python suites without skipping because Azure credentials are absent. Signed-in/live proof remains separate.
- **A7.** The pre-push guard blocks direct pushes to `main`; first publication creates a draft PR, records its number in the worktree configuration and establishes the expected upstream.
- **A8.** `remove` refuses dirty, unpushed, open/unmerged or unpreserved work, verifies the exact PR head was merged or bundled, then removes only the approved worktree/local branch and confirms remote deletion/pruning.
- **A9.** A retained-ref ledger and read-only weekly hygiene report identify canonical parity, direct-main commits, stashes, orphan refs/config, branches without PR/retention records, merged branches surviving past 24 hours, stale/conflicting PRs, lane ownership and parent-repository cleanliness. Seven-day stale branches are reported; at fourteen days they block their lanes until recorded resolution.
- **A10.** Tests cover dirty/behind canonical state, local/remote lane collision, fourth-worktree rejection, `--no-track`, atomic rollback, publish/upstream setup, squash-merge recognition and refusal to remove unpreserved work.

## Validation
- **Offline:** run the lifecycle test suite in an isolated Git fixture, `npm run verify:offline`, ticket/docs checks and the hygiene report against this repository without Azure credentials.
- **Signed-in repository proof:** create/publish/remove one non-production ticket worktree through a draft PR and capture the actual branch, lane, hook and CI results; no unmerged or unbundled branch may be deleted for the proof.

## Research
Distilled 2026-07-14 from the attached worktree, branch and remote recovery plan. This ticket establishes repository controls; it does not relax credential, authorization, RLS, production-write or recovery safeguards.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
