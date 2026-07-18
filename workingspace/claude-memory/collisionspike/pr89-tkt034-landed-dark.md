---
name: pr89-tkt034-landed-dark
description: PR
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c7a881b-5f57-4ff9-92e3-c5384ff58f71
---

**2026-07-15:** PR #89 (`codex/tkt-034-archive-adoption`, TKT-034 archive-holding folder
adoption) was rebased onto post-#87 main and **merged DARK** — merge commit `0fd662a7`, feature
commit `0e63d543` (45 files, +6013/−1483). Branch deleted. After this, the **only open PR is #100
`codex/plan-006-repository-reset`** (the large repo-restructure, ~3214 files, deferred/out of scope).
#73/#83/#87 all previously merged. (My mid-session summary wrongly called the large PR "guided
capture #83" — it's #100 repo-reset; verify open PRs with `gh pr list`, don't trust that summary.)

**Box facade collision resolution (the core work)** — #87 (live) and #89 both added a Box
"delete a file" capability to `functions/box-webhook/`:
- Converged on ONE canonical `delete_file(file_id, *, expected_folder_id)` (#87's parent-pinned
  contract); dropped #89's single-arg `delete_file`. #89's orch caller threads
  `claim.holdingFolderId` (`archiveHolding.ts:85`) via `deleteFile(fileId, expectedFolderId)` →
  `DELETE box/files/{id}?folderId=…`. The deleted source is provably a direct child of the holding
  folder, so the pin costs nothing and strengthens #89.
- Merged `get_folder`[GET]+`mutate_folder`[PATCH,DELETE] → one `folder_lifecycle`[GET,PATCH,DELETE]
  dispatching on `req.method` (house convention, like `file_request_lifecycle`); kept `move_file`[POST].
- Wired the missing `gates.boxRegFolder()` (`BOX_REG_FOLDER_ENABLED`) kill-switch into
  `adoptArchiveHolding`.

**Rebase method that worked:** the branch had 8 commits all touching the same heavy-conflict files
(`cases.ts`, `900_constraints.sql`, `function_app.py`, bundles). Replaying 8× is error-prone AND
`box_client.py` auto-merges with NO conflict (keeping BOTH `delete_file` defs — the silent-collision
trap). Fix: `git checkout -B <local> origin/main && git merge --squash <branch-head>` → resolve the
net diff conflicts ONCE → one commit → force-push. Lands dark via the PR's merge commit regardless.

**"Dark" = deploy-gated, NOT env-gated:** `BOX_REG_FOLDER_ENABLED`/`BOX_API_ENABLED`/
`BOX_FOLDER_AT_INTAKE_ENABLED` are all live-`true` on `cespk-orch-dev`. So the adoption path (with a
real `DELETE /2.0/files/{id}`) goes live the moment `deploy/orch/main.cjs` is deployed (and box-webhook
routes on `func publish`). Do NOT deploy the orch bundle / box-webhook on the strength of the gate.
The converged delete also hard-requires `BOX_ALLOWED_ROOT_ID` stay set (fail-closed). TKT-034 stays
`now`/PENDING — not `done` (dark, no live proof). See [[pr73-tkt154-rebased-remediated]].

**900_constraints.sql MUST be merged MAIN-based** (Azure fact-checker's biggest trap): #89's file is
stale — a "theirs"/whole-file take reverts #87's evidence DELETE-posture (`p_evidence_scoped_delete`
RESTRICTIVE + `complete_evidence_deletion` SECURITY DEFINER seam; evidence stays OUT of the generic
no-delete loop) AND drops main's `capture_*`/`mcp_*`/`capture_session_resume_token` RLS — all with
green offline gates. Correct: start from main's file, add only the four `archive_holding_*` tables.

**Gates green at merge:** api 1010, orch 508, domain 1204, box-webhook pytest **275** (was 267 on
main; +8 from #89's folder/move primitives), SPA 544/545. The 1 SPA failure is the pre-existing
parallel-load-flaky `GuidedPhotoRequestPanel.test.tsx` (passes in isolation — see
[[windows-parser-test-preexisting-failures]] for the "flaky-under-load ≠ regression" pattern). Windows
`verify:offline` is broken (spawns `npm` not `npm.cmd`) — run suites directly.
