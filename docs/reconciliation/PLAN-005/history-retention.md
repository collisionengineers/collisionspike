# PLAN-005 detached and backup history retention

This record implements PLAN-005 lines 169–173 after the external recovery bundle was verified.

## Superseded detached review heads

| Detached head | Worktree | Supersession evidence | Disposition |
|---|---|---|---|
| `d55a192b1cb5e43578329c423b106bbe2304c996` | `C:\Users\PC\AppData\Local\Temp\collisionspike-pr-review-ac782ef5-27cb-40e4-9cba-2095ad0d5d75` | Its TKT-152 documentation variant is superseded by `7864436c`; that commit is an ancestor of reviewed PR #78 head `5af711c6`, whose result `695b8585` is on main. | Remove clean detached worktree; retain the object in the original recovery bundle. |
| `15da3a73c671fc3c751f6289f15f04541dbace42` | `C:\Users\PC\AppData\Local\Temp\collisionspike-pr-review-c6563c17-e820-46a6-9869-133ba0905bf4` | Its vehicle/replay variants have later reviewed forms `891ceb21`, `184c4ce1`, and `7864436c`; all are ancestors of reviewed PR #78 head `5af711c6`, whose result is on main. | Remove clean detached worktree; retain the object in the original recovery bundle. |
| `bcee0e436d041cdc70b1b28703076ce7be8d2ff6` | `C:\Users\PC\AppData\Local\Temp\collisionspike-pr-review-fac1d572-65fe-4f91-8d13-819f2684f42d` | Guided-capture implementations `e3e68f59`, `77603725`, and `3885ce20` are all ancestors of current protected PR #83 head `6998cc45`. | Remove clean detached worktree; PR #83 owns the current behavior. |

All three worktrees returned zero porcelain status lines at the exact heads above before removal. The detached
PR #87 review worktree at `3c4186a1` is not part of this set and remains protected.

## Pre-rewrite main archive

The remote history branch `backup/pre-rewrite-main-20260703` points to
`c72b504b71448ae775a6e7fc0a38a1ad53b47f48`. It is being replaced by the annotated archival tag
`archive/pre-rewrite-main-20260703` at that exact peeled commit. The branch may be deleted only after:

1. the tag is present locally and remotely at the exact target;
2. a verified supplemental recovery bundle contains the annotated tag ref;
3. the supplemental bundle has its own SHA-256 manifest outside the repository; and
4. the remote branch still equals the audited SHA under a force-with-lease deletion.

Execution results are appended only after every condition passes.

## Executed result

Completed 2026-07-13:

- all three superseded detached worktrees were clean at their recorded heads and are now absent and
  unregistered;
- annotated tag `archive/pre-rewrite-main-20260703` exists locally and remotely with tag object
  `e9307b6c9a145c6e4a728e413795bc1738e7f43c` and peels to the exact historical commit
  `c72b504b71448ae775a6e7fc0a38a1ad53b47f48`;
- external supplemental bundle
  `C:\Users\PC\Documents\GitHub\collisionsuite-recovery\collisionspike\20260713T200620Z\archive-pre-rewrite-main-20260703.bundle`
  is 229,365,808 bytes, contains the annotated tag ref and complete history, and passes
  `git bundle verify`;
- its independently recomputed SHA-256 is
  `753c721675bdeed1338c24901c80466b222cffa2edc851d93f194026f6143da7`, recorded in the external
  `SHA256SUMS` and `archive-tag-bundle-manifest.json`; and
- the remote backup branch was then deleted under an exact-SHA force-with-lease. Post-delete checks prove
  the branch absent and the archival tag still present.
