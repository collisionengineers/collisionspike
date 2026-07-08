# Changes — TKT-130: needs_review cases belong in the Review queue — readiness wrongly piles everything into Not Ready

## Status
built + deployed + live re-evaluation recorded (2026-07-08, branch `feat/readiness-ai-spine`) — awaiting verifier

## What changed

**Queue routing (`packages/domain/src/model/queues.ts`)** — per the operator direction:
- `needs_review` MOVED from the "Not ready" queue into the **Review** queue
  (`review.statuses = ['needs_review', 'ready_for_eva']`). Review is now the human-in-the-loop
  queue: flagged-for-a-person OR complete-and-awaiting-the-final-check.
- `statusToStage` changed **in lockstep** (`needs_review` → the `review` funnel stage) so the
  dashboard pipeline strip, the queue tabs, and the dashboard tiles agree — they are all
  single-sourced through `statusToQueue`/`statusToStage`/`filterQueue` (TKT-012 contract held;
  `api/src/functions/dashboard.ts` needed **no change** by construction).
- SPA copy updated to match: Review empty-state hint + Held action label
  (`mockup-app/src/screens/CaseList.tsx`), the dashboard quick-action label ("Check cases waiting
  for review") + stale stage-route comment (`mockup-app/src/screens/Dashboard.tsx`). The Review
  queue now spans two statuses, so the existing status filter appears on it automatically.

**Readiness starvation** — fixed by the TKT-129/109 prefill (see those changes.md): the inspection
item on image-based-provider cases no longer blocks `fieldsValid`.

## Tests
- **New** `packages/domain/src/model/queues.test.ts`: needs_review → review (queue + stage),
  ready_for_eva stays review, the Not-ready set, Held/terminals, the no-status-in-two-queues
  partition invariant, and queue↔funnel lockstep.
- `api/src/functions/dashboard.test.ts` pipeline expectations updated (not_ready 2 / review 2 /
  submitted 1 for the fixture set).
- Suites green: domain 962 / api 279 / mockup-app 312 / orch 170.

## Live re-evaluation summary (2026-07-08, delta `2026-07-08-image-based-provider-prefill.sql`)

Applied via Entra `digital@` → `SET ROLE csadmin` (transient FW rule added+removed; backup
`tkt130_backup_case_status_2026_07_08` = all 346 active pre-re-eval statuses). The re-evaluation
reproduces `statusForReviewCase` (case-status.ts:199-222) exactly, in SQL, over all active cases —
the same shape as the recorded 2026-07-06 pass (the internal `status-evaluate` route needs a
service-audience token `az` cannot mint, AADSTS65001).

**Movement (how many left Not Ready and where they went):**

| from | to | moved |
|---|---|---|
| needs_review | missing_images | **109** |
| missing_required_fields | ready_for_eva | **23** |

**Status distribution before → after:** needs_review 248 → **139**; missing_required_fields 98 →
**75**; missing_images 0 → **109**; ready_for_eva 0 → **23**; error 2; removed 1.

Queue-level effect (with the new mapping, live SPA nav counts): **Not ready 154 / Review 135 /
Held 59** (on-hold cases route to Held regardless of status). 109 formerly-"needs_review" cases now
show their REAL blocker (missing images); 23 complete cases reached **Ready for EVA — the first
non-zero ready_for_eva count on the live stack**.

Full outputs: [evidence/post-reeval-state-2026-07-08.txt](./evidence/post-reeval-state-2026-07-08.txt)
and [TKT-129 evidence/delta-apply-output-2026-07-08.txt](../TKT-129-image-based-inspection-done/evidence/delta-apply-output-2026-07-08.txt).

## Live proof (deployed SPA, staff session)
- A `needs_review` case (**QDOS26029**, YT13UTV) renders **in the Review queue**:
  [evidence/review-queue-needs-review-case-2026-07-08.png](./evidence/review-queue-needs-review-case-2026-07-08.png)
  (queue page + tab counts: [evidence/review-queue-live-2026-07-08.png](./evidence/review-queue-live-2026-07-08.png)).
- **A.QDOS26029-shaped acceptance**: 23 cases (all-required-fields + image-rule-passing, image-based
  providers among them — e.g. A.QDOS26001, A.PCH26001, AX26010, QDOS26050) evaluate **ready_for_eva**
  after TKT-129. **A.QDOS26029 itself** evaluates `missing_images` HONESTLY: its 7 required fields
  all pass (inspection prefilled) but its 20 accepted images include **zero classified `overview`
  with a visible registration**
  ([evidence/aqdos26029-image-rule-detail-2026-07-08.txt](./evidence/aqdos26029-image-rule-detail-2026-07-08.txt))
  — an image-role classification coverage gap (TKT-064 backfill left 12 of its images role-`unknown`),
  not a readiness bug. Suggested follow-up ticket: re-run/extend role classification for
  overview-with-registration coverage.

## Deploy state
Shared with the batch: `cespk-api-dev` republished (86 fns re-verified), SPA redeployed (200 + CSP),
orchestration untouched. Registry updated (`LIVE_FACTS.json` + `live-environment.md`).
