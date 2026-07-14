---
id: PLAN-005
title: Full remediation and repository reconciliation
status: active
tickets: [TKT-150]
depends-on: []
line-references: submitted-body (frontmatter excluded)
---
\# Repository Reconciliation and Delivery Roadmap



\## Summary



The apparent 38-branch problem is mostly historical residue rather than 38 independent features.



| Surface | Audited state | Target |

|---|---:|---:|

| `collisionspike` remote branches | 40 including `main` | `main` only |

| Local worktrees | 39; 10 detached, 4 dirty | One canonical `main`, plus a temporary deploy worktree |

| Open `collisionspike` PRs | #73, #83, #87, #89, #90 | Zero |

| Open companion PRs | `dvla-dvsa-connector` #3 | Zero |

| Stashes | One PR55 helper-script stash | Archived, then removed |

| Unreferenced commit objects | 305 commits across 69 tip roots | Recovery bundle plus disposition ledger |

| Tickets after PR #90 | 196 total, 94 open | All resolved; guided capture becomes TKT-200, making 197 total/95 initially open |



All active feature-worktree heads are either pushed, represented by a safety branch, or already merged. The local-only exceptions are detached review/deployment residue and the stash—not an undiscovered active feature branch. They still require preservation before pruning.



\## 1. Lossless Recovery Before Cleanup



1\. Freeze creation of branches/worktrees until reconciliation completes.

2\. Create a tracked disposition ledger recording every:

&#x20;  - Local/remote branch and exact SHA.

&#x20;  - Worktree path, branch, dirty state and intended disposition.

&#x20;  - Open/merged PR and exact reviewed head.

&#x20;  - Stash.

&#x20;  - Detached head.

&#x20;  - Dirty untracked artifact.

3\. Protect Git history before deleting anything:

&#x20;  - Derive the 69 root tips covering all 305 unreachable commits.

&#x20;  - Temporarily anchor those tips under local archival refs.

&#x20;  - Include all local/remote refs, the stash and archival refs in a timestamped Git bundle stored outside the repository.

&#x20;  - Save a SHA-256 manifest and prove the bundle with `git bundle verify`.

&#x20;  - Do not run aggressive garbage collection until the entire reconciliation ledger is signed off.

4\. Preserve useful dirty artifacts separately:

&#x20;  - Keep the non-empty vehicle-remediation dry/live ledgers and rotated database proof from the detached deployment worktrees.

&#x20;  - Review them for their owning TKT-150/TKT-152 evidence files before committing them.

&#x20;  - Discard the zero-byte proof, generated deployment bundles, transient review-run directories and temporary probe scripts after the evidence is secured.

5\. Archive the PR55 stash containing three old deployment helpers. Compare them with current migrations/runbooks; the expected disposition is “superseded, retained in recovery bundle,” not addition to current source.

6\. Complete a semantic audit of the 69 archival tips:

&#x20;  - Patch-equivalent or later-superseded work gets a recorded discard reason.

&#x20;  - Generated artifacts and temporary deployment commits are discarded.

&#x20;  - Any genuinely unique source/test behavior is ported onto a fresh current-`main` ticket branch; historical WIP branches are never merged wholesale.



\## 2. What Can Be Removed



After the recovery capsule exists, these 28 remote branches are already merged, patch-equivalent or superseded and can be deleted with their corresponding clean worktrees/local branches.



\### Exact merged heads



\- `agent/archive-mirror-defer-varchar`

\- `codex/hotfix-vehicle-field-source`

\- `codex/live-release-proof-20260712`

\- `codex/plan-004-production-readiness`

\- `codex/release-wave-1-artifacts`

\- `codex/tkt-009-outlook-link`

\- `codex/tkt-024-image-case-form`

\- `codex/tkt-129-inspection-choice`

\- `codex/tkt-130-canonical-readiness`

\- `codex/tkt-130-release-artifact`

\- `codex/tkt-150-legacy-doc-integration`

\- `codex/tkt-150-parser-final`

\- `codex/tkt-152-canonical-mileage`

\- `codex/tkt-153-release-artifacts`

\- `codex/tkt-155-responsive-accessibility`

\- `codex/tkt-156-chaser-file-request`

\- `codex/tkt-156-live-proof`

\- `codex/tkt-164-inbound-route`

\- `codex/tkt-165-add-evidence`

\- `codex/tkt-165-deploy-proof`

\- `codex/tkt-166-manual-intake-evidence-upload`

\- `codex/tkt-167-image-gap-chasers`

\- `codex/tkt-168-status-language`

\- `codex/tkt-170-website-enquiry`

\- `codex/ui-readiness-wave`



\### Superseded/history branches



\- `agent/publish-to-distill-case-material` — patch-equivalent to merged work.

\- `codex/tkt-155-dashboard` — its dashboard commits were carried into PR #61.

\- `backup/tkt-165-pre-squash` — historical pre-squash copy of merged PR #65.



The local-only `codex/tkt-153-explicit-save` worktree is also merged and removable.



Detached review heads `d55a192`, `15da3a7` and `bcee0e4` are confirmed superseded by the current mileage and guided-capture implementations. Record that evidence, then remove those worktrees.



Convert `backup/pre-rewrite-main-20260703` into an immutable archival tag included in the recovery bundle, then delete the remote backup branch. Long-lived backups should not remain as normal remote branches.



\### Do not delete yet



\- Five open PR branches.

\- `codex/tkt-154-mcp-image-ingestion-local-20260713`.

\- `codex/tkt-160-delete-case-image-local-20260713`.

\- The three TKT-150 claimant/remediation branches.

\- Dirty deployment worktrees until their ledgers are preserved and the pending PR #86 rollout is reconciled.



\## 3. Exact Integration Order



\### Phase A — Re-establish canonical `main`



1\. Fast-forward the clean local `main` worktree from its stale `d6ffa013` state to remote `main` `927fd187`.

2\. Retain `927fd18 project demo work`; it changes only `project-demo/\*\*`, not runtime code.

3\. Install from the lockfile and run the complete base gate from that exact revision.

4\. Reconcile merged PR #86 as **future-cutover plan hardening**, not as authority to execute the production cutover:

&#x20;  - Keep the pre-TKT-009 runtime in service and document the additive schema state; do not resume the interrupted deployment sequence.

&#x20;  - Correct the impossible Graph create-before-delete assumption and specify a durable one-mailbox-at-a-time rotation state machine, persisted-delta catch-up, drain proof and idempotent outbox; rehearse failures offline, but do not create or deploy an executable rotation endpoint in this plan-hardening stage.

&#x20;  - Produce the backup, restore, dry-run, approval, interruption-recovery and rollback runbook; rehearse it without production writes.

&#x20;  - Hard-gate execution on the signed-off job spreadsheet, authenticated and verified EVA API, confirmed production Archive root plus write approval, verified backup/restore proof, frozen dry-run hash and named operator approval; while EVA is blocked, record it as `not queried` and keep the cutover blocked.

&#x20;  - Only after every gate is satisfied and the operator explicitly opens the window may orchestration pause, subscription rotation, final DDL, API/orchestration/SPA rollout, live Archive reconciliation/retargeting and signed-in proof occur.

&#x20;  - Record offline evidence now and keep TKT-009/TKT-178 pending or blocked; independent live verification happens after the separately approved cutover.



\### Phase B — Normalize ticket authority



1\. Repair PR #90 before review:

&#x20;  - Add binary Git attributes for `\*.eml`, `\*.doc`, `\*.docx` and `\*.pptx` so evidence does not become enormous text patches.

&#x20;  - Keep its contiguous TKT-171–199 allocation.

&#x20;  - Renumber guided capture from TKT-171 to TKT-200 everywhere, including PR #83, PLAN-004 and companion references.

&#x20;  - PLAN-004 becomes 53 members, with TKT-200 in the constrained inbound channel wave.

2\. Rebase PR #90 onto current `main`, run ticket/link/default gates, complete the normal PR review and CI path, merge and delete its branch.

3\. Merge `dvla-dvsa-connector` PR #3 at its already reviewed exact head, then fast-forward its local `main` and delete the feature branch.

4\. Fast-forward and clean the companion repositories:

&#x20;  - `collisioncapture`: PR #2 is merged; remove `codex/guided-camera-feasibility` and the merged design-skill branch.

&#x20;  - `cedocumentmapper\_v2.0`: remove the three branches/worktrees corresponding to merged PRs #8, #9 and #10.



\### Phase C — First cleanup checkpoint



After PR #90 and the safety archive:



\- Remove the 28 safe `collisionspike` remote branches and associated worktrees.

\- Convert and remove the old backup branch.

\- Retain at most: canonical `main`, four active implementation PR worktrees, one TKT-150 closeout worktree and one temporary deploy worktree.

\- Expected remote state: `main`, four remaining PR heads, two safety copies and three TKT-150 closeout branches.



\### Phase D — Reconcile ticket state and TKT-150



1\. Run an independent verification sweep before starting new implementation:

&#x20;  - Re-evaluate all 27 `verify` tickets against the current deployed stack.

&#x20;  - Re-evaluate tickets still in `now`/`backlog` despite merged work, particularly TKT-009, TKT-024, TKT-129, TKT-130 and TKT-149–170.

&#x20;  - Move `VERIFIED-LIVE` tickets to `done`.

&#x20;  - Reopen genuine failures to `now`.

&#x20;  - Leave unavailable live shapes honestly `PENDING`.

&#x20;  - Exclude TKT-034, TKT-154, TKT-160 and TKT-200 until their PRs deploy.

2\. Consolidate the three TKT-150 branches into one current-main closeout branch:

&#x20;  - Port only the latest remediation tool and evidence.

&#x20;  - Generate a fresh immutable dry-run plan; do not reuse the old 134-case plan.

&#x20;  - Take a backup, require before-value checks and fill-only writes, apply the reviewed plan, and produce a per-case outcome ledger.

&#x20;  - Independently verify claimant recovery/readiness and merge the closeout evidence.

&#x20;  - Delete all three old TKT-150 branches/worktrees.



\### Phase E — Merge the four implementation PRs serially



Each PR must rebase onto the newly merged predecessor. For every PR: regenerate checked-in deployment artifacts, run the complete repository gate, complete the normal PR review and CI path, merge, deploy where the ticket and operator authorization permit, verify the applicable offline/live acceptance evidence, close its ticket, then delete both the PR and safety branches.



1\. \*\*PR #89 — TKT-034 Archive holding/adoption\*\*

&#x20;  - Establish registration-named holding folders and atomic adoption into Case/PO folders.

&#x20;  - Deploy and prove only within Archive test root `392761581105`.



2\. \*\*PR #87 — TKT-160 individual image deletion\*\*

&#x20;  - Use `codex/tkt-160-delete-case-image-local-20260713` as the preserved source rather than the older PR head.

&#x20;  - Reconcile deletion with the newly merged holding/adoption and canonical evidence rules.

&#x20;  - Deploy schema → Box function → API → SPA and prove deletion/retry/tombstone behavior in the test root.



3\. \*\*PR #73 — TKT-154 constrained MCP image ingestion\*\*

&#x20;  - Use `codex/tkt-154-mcp-image-ingestion-local-20260713` as the source instead of the stale conflicting PR head.

&#x20;  - Rebase after deletion so lookup eligibility, RLS, registration binding, upload recovery and error-case behavior share the final evidence model.

&#x20;  - Deploy gate-off first; verify standard MCP/client behavior and test-root uploads before enabling the intended path.



4\. \*\*PR #83 — TKT-200 guided capture\*\*

&#x20;  - Rebase last because it touches the same session, evidence, cleanup, merge and deployment surfaces.

&#x20;  - Integrate the final Archive adoption, deletion and constrained-ingestion behavior.

&#x20;  - Keep public ingress disabled until throttling, origin controls, cleanup-race coverage, mobile browser tests and physical-device proof pass.

&#x20;  - Deploy migration → API → SPA, then verify against the already-merged `collisioncapture` client.



\## 4. Remaining Ticket Programme



After PR #90 plus TKT-200, the initial ledger is 197 tickets with 95 open. Only tickets still unresolved after the verification sweep should be implemented; merged behavior must not be rebuilt merely because its ticket folder is stale.



\### PLAN-004 delivery waves



| Wave | Tickets |

|---|---|

| Governance/control | TKT-149, 199, 195, 159, 164 |

| Canonical data/save/readiness | TKT-150, 151, 152, 153, 168 |

| Evidence and Archive foundations | TKT-165, 166, 175, 160, 162, 174 |

| Photo decisions/checking | TKT-179, 181, 161, 167, 198 |

| Identity/numbering/duplicates | TKT-004 + 171, 172, 177, 163, 197 |

| Pre-case and specialised intake | TKT-193, 192, 102, 188 |

| Email correlation/taxonomy/actions | TKT-183, 170, 184, 186, 187, 041, 173 |

| Suggestion provenance | TKT-185, 191, 194 |

| Constrained inbound | TKT-154, 156, 200 |

| Handler-facing convergence | TKT-155, 176, 169, 182, 190, 189, 180, 157 |

| Production cutover/remediation | TKT-178, then TKT-158 |



For TKT-004/TKT-171, use one Postgres-owned, concurrency-safe allocator scoped by marker/principal/year. Seed or reconcile it once from confirmed Archive state; do not perform a runtime Archive scan for every allocation. Three digits remain the minimum display width, with 1000–9999 accepted without truncation.



\### Other active plans



\- \*\*PLAN-002:\*\* independently verify/finish TKT-094 and TKT-095 after canonical readiness and evidence state are stable.

\- \*\*PLAN-003:\*\* verify or reopen TKT-133, 137, 141, 144, 145, 146, 147 and 148; resolve TKT-135 through real provider samples.

\- \*\*PLAN-001:\*\* verify TKT-016, 066, 069, 072, 077, 078, 110 and 111; finish TKT-067, 068, 107 and 018 after the evidence and API authorization boundaries are final.

\- \*\*Standalone/unplanned:\*\* reconcile TKT-020, 021, 043, 044, 047, 052, 055, 084 and 089 through the verification sweep. Implement TKT-196 after PLAN-004 rather than leaving it indefinitely deferred.



\### Blocker burn-down



Search the authorized repository, Outlook read-only data and Archive read-only production folders before asking for more material. Any residual request should be made once as a consolidated input pack:



\- TKT-032: intended routing/action for the supplied Audatex and PCD-diminution examples.

\- TKT-035: one real information-request email plus the expected category.

\- TKT-057: an inbound diminution instruction and, if available, standalone QDOS audit instruction.

\- TKT-104: Tractable developer documentation.

\- TKT-135: one source instruction per zero-coverage provider layout, PCH first.



These tickets cannot truthfully become `done` without their grounding input. If the sources cannot be recovered and the input is not supplied, they remain explicitly blocked rather than being “completed” with invented behavior.



\## 5. Interfaces, Migrations and Release Discipline



\- Cleanup and ticket distillation change no runtime API.

\- PR #89 owns Archive holding/adoption identity.

\- PR #87 owns the canonical deletion lifecycle and durable deletion state.

\- PR #73 owns the least-privilege MCP ingestion interface.

\- PR #83/TKT-200 owns the guided-capture OpenAPI/session/upload contract.

\- TKT-004/TKT-171 owns the shared Case/PO parser/allocator contract.



For each integration:



1\. Rebase onto exact current `main`.

2\. Resolve shared schema/constraint files semantically, never by accepting one side wholesale.

3\. Apply migrations in an isolated transaction first; prove idempotency, RLS, grants and rollback.

4\. Regenerate domain/OpenAPI types and deployment bundles from source.

5\. Merge only reviewed exact heads.

6\. Deploy in dependency order: database → API/Functions → orchestration → SPA/client.

7\. Record deployed revision and live evidence before beginning the next overlapping PR.



\## 6. Final Acceptance and Anti-Recurrence Rules



Completion requires all of the following:



\- No open PRs across `collisionspike`, `collisioncapture`, `cedocumentmapper\_v2.0` or `dvla-dvsa-connector`.

\- All companion `main` branches match their remotes.

\- Every ticket is `done`, or has a named genuinely unavailable external input; no stale `now`, `verify` or backlog status hides completed work.

\- PLAN-004, PLAN-003, PLAN-002 and PLAN-001 have independent closeout reviews.

\- TKT-178 production reconciliation has backup, frozen dry-run hash, approved inputs and per-row ledger.

\- TKT-158 accounts for every affected case as repaired, source-absent, conflicting, intentionally held or failed with a named follow-up.

\- Azure health/function inventory, Graph subscriptions, auth/CORS, Postgres RLS/grants, Archive ancestry and signed-in Chrome workflows agree with repository state.

\- Outlook verification remains read-only; ordinary Archive writes remain inside the test root until the explicitly approved TKT-178 cutover.

\- `collisionspike` remote branches reduce to `main`; local worktrees reduce to one canonical `main` plus only a short-lived clean deploy worktree.

\- The stash is removed only after its recovery-bundle proof.

\- The recovery bundle and reconciliation ledger remain available; only then may Git prune unreachable objects.



Prevent recurrence by enforcing:



\- No direct pushes to `main`, including docs/demo work.

\- Every branch has a ticket and draft PR from its first push.

\- Auto-delete branches after merge.

\- No remote `backup/\*` branches; use verified bundles/tags outside the normal branch list.

\- Maximum three active feature worktrees, plus canonical `main` and one ephemeral deploy worktree.

\- Weekly branch/worktree inventory and `git worktree prune`.

\- A PR cannot start until its predecessor touching the same schema/evidence surface has merged and deployed.
