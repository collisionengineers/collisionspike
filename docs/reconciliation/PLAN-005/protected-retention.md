# PLAN-005 protected retention set

Snapshot after PLAN-005 lines 89–173 cleanup. This implements lines 177–189: none of the refs or worktrees
below may be removed until its later integration/deployment prerequisite is complete.

## Five open PR heads

| PR | Remote branch | Exact head | Current merge state | Retention owner |
|---:|---|---|---|---|
| #90 | `codex/distill-ticket-drop` | `7b2b5fb44991ad59cfd780796b7008b74bed69d3` | draft, mergeable, unstable checks | Ticket-authority normalization stage. |
| #89 | `codex/tkt-034-archive-adoption` | `7daf9c1f4dc56c7f261631ac49f8299d51eae8a7` | draft, mergeable, unstable checks | TKT-034 integration/live verification stage. |
| #87 | `codex/tkt-160-delete-case-image` | `3c4186a164c5c66be06e098a7e3af4c5dc9ad6f0` | draft, mergeable, unstable checks | TKT-160 reconciliation stage. |
| #83 | `codex/guided-capture-server` | `6998cc45c6bf8e45daefb690ca1017e87546cc7a` | draft, mergeable, unstable checks | Guided capture renumber/integration stage. |
| #73 | `codex/tkt-154-mcp-image-ingestion` | `d3c11e26b05a2ff2f2f0a77b27724d745700cdfa` | draft, conflicting | TKT-154 reconstruction stage. |

The current workspace is the PR #83 worktree and contains only the operator-supplied PLAN-005 plus the
reconciliation scripts/evidence created by this run. Those files must be normalized through PR #90 before
the guided-capture branch is integrated.

## Safety and TKT-150 sources

| Remote source | Exact head | Local ownership |
|---|---|---|
| `codex/tkt-154-mcp-image-ingestion-local-20260713` | `f59ae4873b9bbd944308bcb8f98b53c6505fe14d` | Local branch `codex/tkt-154-mcp-image-ingestion`, clean worktree `collisionspike-tkt-154`; newer reconstruction source for PR #73. |
| `codex/tkt-160-delete-case-image-local-20260713` | `2681fd25db45a6b1d0ce927c64f07374cea8dfa5` | Local branch `codex/tkt-160-delete-case-image`, clean worktree `collisionspike-tkt160`; newer reconstruction source for PR #87. |
| `codex/tkt-150-claimant-extraction` | `a2b346406eea961a4f7a41e20acc53df0fa24f5f` | Clean `collisionspike-tkt-150` worktree. |
| `codex/tkt-150-live-proof` | `80e4868bbb3d54bb1d5fb008e047e842a7a24b26` | Clean `collisionspike-tkt-150-live` worktree. |
| `codex/tkt-150-live-remediation` | `ed63af703c894d4ce4a2f6d56d24dbaae2b4df85` | Clean `collisionspike-tkt-150-remediation` worktree. |

The PR #87 detached review worktree at `3c4186a1` is also retained until its safety source is reconciled.

## Deployment worktrees

The following remain until their rollout records are accepted or the PR #86 rollout is reconciled:

- dirty `collisionspike-deploy-695b858` at PR #78 result `695b8585`;
- clean `collisionspike-deploy-da56628` at PR #82 result `da56628c`;
- clean `collisionspike-deploy-eaa31fb` at PR #80 result `eaa31fbe`;
- clean `C:\w\deploy-9bb` at PR #85 result `9bbab2e7`;
- clean `C:\w\deploy-e223` at PR #88 result `e2233bd1`; and
- clean `C:\w\deploy-f419` at PR #86 result `f419e315`.

The dirty PR #78 checkout requires explicit reconciliation. Its initial snapshot contained two modified
generated bundles and six untracked remediation/proof files. Those exact bytes were preserved in the external
dirty-state capsule; transient/zero-byte files were then removed and the three useful evidence files retained.
The current snapshot additionally reports 492 tracked source-file deletions (tracked-diff SHA-256
`71d3fc719acfba2a496f0ba7a6991d8f1c9572b265cd5f743fb1bcfe4f172115`). This drift appeared during the
repository cleanup and is not accepted as ticket evidence. Do not restore, remove, or use this worktree for
source until its rollout/evidence ownership is reconciled; the exact committed tree remains recoverable from
the repository and external bundle.

## Canonical main

Local `main` remains clean at `d6ffa01309639e06a5d50514d70bfba38fec8246`, behind current
`origin/main` `927fd1872432c39ba8ffe3fc7eca565bd078d7e3`, in the dedicated
`collisionspike-ui-readiness` worktree. Its next authorized mutation is the canonical fast-forward and base
gate in PLAN-005 lines 193–205.

## Phase C checkpoint update — 2026-07-14

This section supersedes the mutable counts above while retaining their historical pre-checkpoint evidence.

- PR #90 merged as `308294c45c83cc692873fda2f1e82babb3403618`; its local/remote branch and worktree are gone.
- Canonical `main` is clean at that same SHA and equals `origin/main`.
- The detached PR #87 review checkout was removed; the reviewed head remains on the open PR branch and in
  the verified recovery bundle. The newer local safety-source worktree remains.
- All six stale deployment worktrees were removed. The dirty PR #78 evidence files matched the recovery
  capsule byte-for-byte; its other 492 changes were deletions only. The two modified PR #86 generated
  bundles were already preserved as an exact external patch. No temporary deploy worktree is retained.
- The clean `codex/tkt-150-claimant-extraction` and `codex/tkt-150-live-proof` worktrees were removed while
  their branch refs remain. The one retained TKT-150 closeout worktree is
  `codex/tkt-150-live-remediation` at `ed63af703c894d4ce4a2f6d56d24dbaae2b4df85`.
- The bounded state is now six worktrees: canonical `main`, four active implementation sources and one
  TKT-150 closeout. The remote has exactly ten branches: `main`, four PR heads, two safety copies and three
  TKT-150 closeout branches. See `current-inventory.json` generated at `2026-07-14T01:03:54.191Z`.
