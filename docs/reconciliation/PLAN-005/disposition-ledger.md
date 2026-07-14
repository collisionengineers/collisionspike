# PLAN-005 repository disposition ledger

Status: active — Git recovery capsule, dirty-state preservation, and the 69-tip semantic audit are complete.
Only objects proven safe by the recorded deletion matrix may now be removed; protected integration sources
remain frozen until their ordered PR/ticket stage.

This ledger implements PLAN-005 lines 41–55. The machine-readable snapshot in
[`initial-inventory.json`](./initial-inventory.json) is the exhaustive record. It contains every local
and `origin/*` branch with its exact SHA, every worktree with its path/head/branch/dirty state and intended
disposition, every pull request with its exact head SHA and merge commit when present, every stash, every
detached head, and SHA-256/size metadata for each dirty untracked file.

## Freeze

- Do not create another branch or worktree until the recovery bundle, hash manifest, and semantic-tip audit
  exist.
- Do not delete a ref, worktree, stash, or untracked artifact until its recovery proof and disposition are
  recorded here.
- Do not run aggressive garbage collection until the final reconciliation sign-off.
- Refresh the snapshot after any approved disposition change with:
  `node scripts/plan-005-inventory.mjs --output docs/reconciliation/PLAN-005/current-inventory.json`.

## Initial snapshot

Generated from a freshly pruned `origin` view on 2026-07-13. The snapshot itself records its exact UTC
generation time and `origin/main` SHA.

| Surface | Count | Initial disposition |
|---|---:|---|
| Local branches | 36 | Classify semantically; retain only canonical `main` and protected integration sources until resolved. |
| Remote branches | 40 excluding `origin/HEAD` | Delete only after recovery proof and the relevant PR/ticket disposition. |
| Worktrees | 39 | Reduce to canonical `main`; each row in the snapshot carries its own intended disposition. |
| Detached worktrees | 10 | Preserve dirty evidence/diffs, record supersession, then remove after bundle proof. |
| Dirty worktrees | 5 | Preserve the plan, useful remediation evidence, and any unique tracked diff before cleanup. |
| Open pull requests | 5 | Resolve in PLAN-005 order; do not delete their source refs first. |
| Stashes | 1 | Bundle and compare with current migrations/runbooks before dropping. |

## Protected integration sources

These remain until their ordered integration step is complete:

- PR #90 `codex/distill-ticket-drop` — ticket-authority normalization.
- PR #89 `codex/tkt-034-archive-adoption` — Archive holding/adoption.
- PR #87 remote head `codex/tkt-160-delete-case-image`, with
  `codex/tkt-160-delete-case-image-local-20260713` / local SHA source retained for reconstruction.
- PR #73 remote head `codex/tkt-154-mcp-image-ingestion`, with
  `codex/tkt-154-mcp-image-ingestion-local-20260713` / local SHA source retained for reconstruction.
- PR #83 `codex/guided-capture-server` — guided capture, to be renumbered to TKT-200 and integrated last.
- TKT-150 claimant/remediation source branches — retain until one current-main closeout is independently
  verified.

## Dirty-artifact policy

- Preserve the non-empty vehicle-remediation dry/live ledgers and rotated database proof for TKT-150/TKT-152
  ownership review.
- Treat the zero-byte live proof, generated deployment bundles, temporary probe scripts, and reciprocal-review
  run directory as discard candidates only after the recovery capsule contains their current state.
- Preserve `PLAN-005-full-remediation-plan.md`; it is the operator-supplied authority for this run and was
  untracked at the initial snapshot.
- The PR55 stash is expected to be superseded, but remains until its three helper scripts are compared with the
  current migration/runbook path and the bundle proves recoverability.

### Preservation result

All five dirty worktrees and the stash were copied without mutation to
`C:\Users\PC\Documents\GitHub\collisionsuite-recovery\collisionspike\20260713T200620Z\dirty-state`.
The dirty-state manifest records 20 preserved files; every entry in its `SHA256SUMS` independently re-hashed
successfully.

| Artifact | Review | Disposition |
|---|---|---|
| `vehicle-remediation-dry.json` | 174 dry-run rows; no secrets found; vehicle-data/remediation evidence, not claimant evidence | Retain for TKT-152/TKT-151 and later TKT-158 closeout. Do not treat as completion proof. |
| `vehicle-remediation-live.json` | 176 result rows, 156 attempted and 19 failed; names the pre-run backup | Retain for TKT-152/TKT-151 and later TKT-158 residual accounting. The failed/residual state requires a fresh controlled rerun. |
| `db-proof-rotated.txt` | Proves the API login was `cespk_app` and records four vehicle lookup/result rows | Retain as TKT-152 deployment evidence; it does not satisfy the full ticket acceptance. |
| `live-vehicle-proof.txt` | Zero bytes | Discard after capsule preservation. |
| Modified `deploy/*/main.cjs` files | Generated bundles; exact binary diffs are in the dirty-state capsule | Restore/discard; regenerate from reviewed source at each integration. |
| `.tmp-*.mjs` files | One-off probes/runners; source copies are in the dirty-state capsule | Discard; canonical rollout/remediation tooling must come from reviewed current-main source. |
| Reciprocal-review run directory | 981,370-byte transient review context, preserved in the capsule | Discard; GitHub exact-head review records are authoritative. |

### PR55 stash audit

The stash at `8e72995a11a04aeed279e85ba00b5fb6adac63a3` contains only three one-off deployment helpers.
They are superseded:

- `apply-pr55.sql` manually applies the ten additive deltas already present on `main`; the signed deployment
  record states they were applied, replayed, and postchecked successfully on 2026-07-11.
- `run-pr55-migration.sh` hard-codes the completed PR55 cutover and a temporary worktree path; the maintained
  `.azure/deployment-plan.md` and `.azure/validate-pr55.sql` now carry the durable pre/postcheck record.
- `validate-box-classification-hotfix.sql` prepares one query shape now covered by the live Data API source and
  focused tests.

None should be added to current source. Their exact bytes exist both in the Git bundle and under the dirty-state
capsule; the stash may therefore be dropped.

## Disposition log

| Date | Object | Evidence | Disposition |
|---|---|---|---|
| 2026-07-13 | Initial repository state | `initial-inventory.json` | Frozen; no destructive action yet. |
| 2026-07-13 | 305 unreachable commits / 69 maximal tips | `refs/archive/plan-005/20260713/tip-001` … `tip-069` | Anchored locally and included in the verified bundle. |
| 2026-07-13 | All 147 required branch/remote/tag/stash/archive refs | `C:\Users\PC\Documents\GitHub\collisionsuite-recovery\collisionspike\20260713T200620Z\capsule-manifest.json` | Present at exact SHA in the external bundle. |
| 2026-07-13 | `collisionspike.bundle` (431,641,144 bytes) | SHA-256 `66745f013834d7f5c038178b66aebadf70b5a76b4928d64e669fca75c401e621`; independent `git bundle verify` passed | Retain outside the repository through final sign-off. |
| 2026-07-13 | Five dirty worktrees and PR55 stash | External `dirty-state/dirty-manifest.json`; 20/20 SHA-256 checks passed | Useful vehicle evidence retained; transient/generated artifacts approved for discard; stash superseded. |
| 2026-07-13 | 69 archival maximal tips | [`archival-tip-dispositions.md`](./archival-tip-dispositions.md) | Every tip semantically audited; zero unique source/test ports required; protected behavior remains assigned to its current PR/ticket source. |
| 2026-07-13 | PLAN-005 safe-deletion set | [`safe-deletion-matrix.md`](./safe-deletion-matrix.md) | Removed 21 clean worktrees, 28 matching local branches plus local-only PR #72, and 28 remote refs atomically under exact-SHA leases; all remote refs rechecked absent. |
| 2026-07-13 | Superseded detached heads and pre-rewrite backup branch | [`history-retention.md`](./history-retention.md) | Removed three clean superseded review worktrees; replaced the backup branch with a verified remote annotated tag and hashed supplemental bundle, then deleted the branch under an exact lease. |
| 2026-07-13 | Protected branches/worktrees after cleanup | [`protected-retention.md`](./protected-retention.md) | Five open PR heads, two safety sources, three TKT-150 sources, PR #87 review state, canonical main, and six deployment worktrees retained for their ordered prerequisites. |
| 2026-07-13 | Canonical main baseline | [`canonical-main-gate.md`](./canonical-main-gate.md) | Fast-forwarded clean local main to exact origin/main `927fd187`; deterministic install and aggregate offline gate passed with 8 pass, 0 fail, 13 declared skips. |
| 2026-07-13 | TKT-009 attempted rollout boundary and restoration | [`tkt009-cutover-boundary-2026-07-13.md`](./tkt009-cutover-boundary-2026-07-13.md) | Restored the pre-PR-86 API and unchanged orchestration runtime; retained only additive Phase-A DDL; final DDL, subscriptions, SPA, EVA and production Archive remained untouched. Future execution is blocked on the signed job spreadsheet, verified EVA API, approved production Archive target/writes, restore proof, frozen dry-run hash and named approval. |
| 2026-07-14 | Phase C first cleanup checkpoint | [`current-inventory.json`](./current-inventory.json) | After PR #90 merged, removed the redundant detached PR #87 review, all six stale deploy worktrees and two clean TKT-150 worktrees. Recovery hashes were rechecked before dirty removals. Final checkpoint: six worktrees, zero detached worktrees, one intentionally dirty plan-authoring worktree, four open PRs, ten remote branches in the exact expected classes and no stash. |

## Sign-off gates

- [x] External Git bundle created from all refs, stash, and temporary archival refs.
- [x] SHA-256 manifest saved and `git bundle verify` passes.
- [x] Dirty artifacts are copied/hashed into the recovery capsule or intentionally retained in ticket evidence.
- [x] Every archival root tip has a semantic disposition.
- [ ] All open PR heads are resolved and their reviewed exact heads are recorded.
- [ ] Final snapshot shows `main` only remotely and one canonical clean `main` worktree locally.
- [ ] Only after all prior items: unreachable objects may be pruned.
