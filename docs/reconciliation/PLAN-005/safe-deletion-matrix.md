# PLAN-005 safe branch and worktree deletion matrix

Baseline: freshly pruned `origin`, `origin/main` at
`927fd1872432c39ba8ffe3fc7eca565bd078d7e3`, and the verified external recovery capsule at
`C:\Users\PC\Documents\GitHub\collisionsuite-recovery\collisionspike\20260713T200620Z`.

This matrix implements PLAN-005 lines 89–165. GitHub uses squash merges for much of this repository, so
literal ancestry alone is insufficient. Every merged-PR row below was checked against GitHub's immutable
merged PR record: the listed ref still points to the PR's exact reviewed head SHA and its squash/rebase
result is present on `origin/main`. Superseded/history rows use stable patch IDs, range-diffs, and tree/blob
comparisons instead.

## Remote and corresponding local branches approved for deletion

| Branch | Exact tip | Proof recorded before deletion |
|---|---|---|
| `agent/archive-mirror-defer-varchar` | `dcb34a7913d0871f85d22ac6fb2516ef7f7cb507` | Exact merged PR #82 head; result `da56628c` is on main. |
| `codex/hotfix-vehicle-field-source` | `4136156f9def1514dd26a3722476167ae5f69c79` | Exact merged PR #88 head; result `e2233bd1` is on main. |
| `codex/live-release-proof-20260712` | `e7aa22689fac9f02a1bc3c6cf0ea672f9ec35f51` | Exact merged PR #64 head; result `7bc54528` is on main. |
| `codex/plan-004-production-readiness` | `26b22c5b227ac30b5d515eb585432c421e41cb6e` | Exact merged PR #60 head; result `7421d4be` is on main. |
| `codex/release-wave-1-artifacts` | `c80e413f2eb462bfb10e35d4b147e727b0f8171c` | Exact merged PR #63 head; result `54a04d13` is on main. |
| `codex/tkt-009-outlook-link` | `1ce920fbc53159a8f36c5343997a8e50eab78307` | Exact merged PR #86 head; result `f419e315` is on main. |
| `codex/tkt-024-image-case-form` | `d39e9844918073f807b19055218b8edc0c08133e` | Exact merged PR #84 head; result `fd12cf84` is on main. |
| `codex/tkt-129-inspection-choice` | `e0f3c84954bbbdedf8f4501aee660a61e8de4b22` | Exact merged PR #85 head; result `9bbab2e7` is on main. |
| `codex/tkt-130-canonical-readiness` | `d1d84ec6a703cf93e2675c132b6009a547f6754d` | Exact merged PR #69 head and literal ancestor of main. |
| `codex/tkt-130-release-artifact` | `bb9c8f546774c1fa279e0dd3004b36b926b4ba0e` | Exact merged PR #70 head and literal ancestor of main. |
| `codex/tkt-150-legacy-doc-integration` | `6ea86db3b496c82945c6250e7fdc3dc8afcea5c7` | Exact merged PR #71 head and literal ancestor of main. |
| `codex/tkt-150-parser-final` | `d2f5430e083041f5957d0f73f497e3ba5b5b1ad5` | Exact merged PR #68 head and literal ancestor of main. |
| `codex/tkt-152-canonical-mileage` | `5af711c646b5e556ca86183b1e42df23c9ab4e32` | Exact merged PR #78 head; result `695b8585` is on main. |
| `codex/tkt-153-release-artifacts` | `768c3bd4b2f1589528e096524bacfa5fc9158b73` | Exact merged PR #74 head and literal ancestor of main. |
| `codex/tkt-155-responsive-accessibility` | `73f0a07f144cc15a46763fe9f8ae181092c99108` | Exact merged PR #67 head; result `f1f789e4` is on main. |
| `codex/tkt-156-chaser-file-request` | `3edffdb901916b36f8c9b5eacf0ba13bb76e63d0` | Exact merged PR #77 head and literal ancestor of main. |
| `codex/tkt-156-live-proof` | `558d5af56da87b5d372753417b23225aefa5adc9` | Exact merged PR #79 head; result `79a87dd9` is on main. |
| `codex/tkt-164-inbound-route` | `5ae4566fe13995fb6c17b907a681c4622e2f1b5c` | Exact merged PR #62 head; result `09e81719` is on main. |
| `codex/tkt-165-add-evidence` | `1d10f63b6245be9d091f89da69b38304f447408d` | Exact merged PR #65 head; result `7883a670` is on main. |
| `codex/tkt-165-deploy-proof` | `e72cad148ae35b7037f39fb848352e706dc3e11d` | Exact merged PR #66 head; result `43a30c22` is on main. |
| `codex/tkt-166-manual-intake-evidence-upload` | `f9707b02b127127a0058becc4cd9eb4940cd2a35` | Exact merged PR #75 head and literal ancestor of main. |
| `codex/tkt-167-image-gap-chasers` | `bcd4aa2c2b88fe7c89bdebda2a32266faf61e7ba` | Exact merged PR #81 head; result `ba78ea3d` is on main. |
| `codex/tkt-168-status-language` | `0285223f7042ff1b80c27ea32a4d1cc2c257b17f` | Exact merged PR #76 head and literal ancestor of main. |
| `codex/tkt-170-website-enquiry` | `4ad7117b0180d22aa9c116c460a84038610efb64` | Exact merged PR #80 head; patch-equivalent result `eaa31fbe` is on main. |
| `codex/ui-readiness-wave` | `de34a25a30e0f61bf349db79eef03f9b1c6045eb` | Exact merged PR #61 head; result `d2ff80bb` is on main. |
| `agent/publish-to-distill-case-material` | `4b2972fc2afdf30e557a91d8d1eb35e60ff97a9b` | Stable patch ID equals main `48fead0`; earlier PR #56 is merged. |
| `codex/tkt-155-dashboard` | `4d1e42efcb4f965cf3107cc8ace0bfa9f3759da9` | Its substantive dashboard commits have stable patch IDs equal to the corresponding PR #61 commits; later main work supersedes its ledger context. |
| `backup/tkt-165-pre-squash` | `e12aa7f887cac561f786489ac5257d8cf0cf58b4` | Semantic, not mechanical, proof: its 18-commit pre-squash history range-diffs into PR #65's reviewed head; the reviewed head adds later upload/archive/manual-intake hardening. Exact history is retained in the verified bundle. |

The last row is deliberately called out: it is neither a literal ancestor nor a one-commit patch match.
It is safe only because the complete pre-squash range was semantically compared with merged PR #65 and is
recoverable by exact SHA from the external bundle.

## Local-only approved branch

| Branch | Exact tip | Proof |
|---|---|---|
| `codex/tkt-153-explicit-save` | `075a691ca902e40c850f55169d324815f5021bd3` | Exact merged PR #72 head; result `ab2d677f` is on main; its worktree is clean. |

## Clean worktrees approved for removal

All 21 paths below were rechecked immediately before cleanup and returned zero porcelain status lines. Path
resolution is recorded because worktree removal is the only filesystem mutation in this stage.

| Branch | Worktree path |
|---|---|
| `agent/archive-mirror-defer-varchar` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-archive-defer` |
| `codex/hotfix-vehicle-field-source` | `C:\w\vf` |
| `codex/plan-004-production-readiness` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-plan-004` |
| `codex/tkt-009-outlook-link` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt009` |
| `codex/tkt-024-image-case-form` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-024` |
| `codex/tkt-129-inspection-choice` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-129` |
| `codex/tkt-130-canonical-readiness` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-130-readiness` |
| `codex/tkt-150-legacy-doc-integration` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-150-legacy-doc` |
| `codex/tkt-150-parser-final` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-150-final` |
| `codex/tkt-152-canonical-mileage` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt152` |
| `codex/tkt-153-explicit-save` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-153` |
| `codex/tkt-153-release-artifacts` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-153-release` |
| `codex/tkt-155-responsive-accessibility` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-155` |
| `codex/tkt-156-chaser-file-request` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-156` |
| `codex/tkt-156-live-proof` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-156-live` |
| `codex/tkt-164-inbound-route` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-164-api` |
| `codex/tkt-165-add-evidence` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-165` |
| `codex/tkt-166-manual-intake-evidence-upload` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-166` |
| `codex/tkt-167-image-gap-chasers` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-167` |
| `codex/tkt-168-status-language` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-168` |
| `codex/tkt-170-website-enquiry` | `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-tkt-170` |

## Explicit exclusions

Open PR heads (#73, #83, #87, #89, #90), their local safety sources, TKT-150 claimant/remediation/live-proof
sources, the deployment-evidence worktree, canonical `main`, and the current plan-authoring workspace are not
approved by this matrix. Their later prerequisites are recorded in the disposition ledger and PLAN-005.

## Executed result

Completed 2026-07-13 after a final freshly fetched exact-SHA preflight:

- all 21 listed worktree paths were clean at their recorded heads, then removed and proved absent and
  unregistered;
- 28 corresponding local branches plus the local-only PR #72 branch were deleted at their recorded SHAs
  (the publish-to-distill ref had no local branch);
- all 28 remote branches were deleted in one atomic Git push with a separate
  `--force-with-lease=<ref>:<audited-sha>` guard for every ref;
- a post-delete fetch/prune and individual `ls-remote` checks proved all 28 remote refs absent.

The explicit exclusions above remain present for their ordered integration stages.
