# Changes — TKT-130: one canonical Review readiness contract

## Current status — reopened implementation (2026-07-12)

Implemented and fully tested offline on `codex/tkt-130-canonical-readiness`; not deployed and no live
case status has been recomputed by this branch. PR review, merge, release bundles, deployment,
backup-first active-case recomputation and independent live verification remain for the orchestrating
session.

## Commit

- `6eb7cdb` — replace the competing status/UI/queue/submission predicates with one canonical EVA
  readiness gate and exhaustive regression coverage.
- `26a1db3` — require the current workflow state itself to be Review, preventing a complete-looking
  duplicate, terminal, or other non-Review case from bypassing the client submission gate.
- Final review follow-up — make the workflow blocker count/copy truthful when field/image checks are
  green but the case has not reached Review, and add the positive atomic submission-path test.

## Reopened change summary

- **One domain verdict:** `evaluateCaseReadiness` now owns required fields, an explicit and
  internally-consistent inspection choice, accepted-image count/roles, unresolved automatic image
  decisions and every `needs_review`/`conflict` field state. `readinessInputForCase` is the one adapter
  used by API recomputation, the SPA checklist and submission eligibility.
- **Review is complete-only:** `needs_review` moved back to **Not ready**; Review contains only
  `ready_for_eva`. `caseToQueue` is now the single queue-membership predicate, including explicit Held
  precedence and retired-merge exclusion. Dashboard stage/count derivation follows the same mapping.
- **Persisted status agrees with the checklist:** both staff and orchestration status recomputation call
  the same domain evaluator. The orchestration-facing API path now loads field provenance as well as
  evidence, so review states cannot silently default or drift between paths.
- **Submission re-checks current truth:** the staff EVA-submitted route locks and reloads the complete
  case snapshot, then runs the same readiness + queue predicate before the atomic terminal transition.
  Stale `ready_for_eva`, an explicit hold, a merge branch or any current blocker returns a no-op.
- **SPA is an adapter, not another evaluator:** Case Detail and the EVA dialog project the domain checks,
  disable submission from the shared eligibility result and state the hold reason plainly. Review's
  empty-state copy now describes only complete cases; its redundant status filter is hidden.
- **Matrix coverage:** QDOS26079-shaped missing details, blank claimant, blank model, unresolved review,
  conflict, all images excluded, unresolved automatic image decision, unknown inspection choice,
  explicit Image Based Assessment, missing registration-visible overview, missing damage close-up,
  valid complete case, stale ready status and explicit hold.

## Files touched (reopened implementation)

- `packages/domain/src/contracts/{case-status,image-rules}.ts`
- `packages/domain/src/model/{case-readiness,queues}.ts`
- `services/data-api/src/features/{cases,inbound,providers}/`
- `services/data-api/src/shared/mapping/`
- `apps/web/src/shared/ui/readiness.ts`
- `apps/web/src/features/cases/{CaseDetail,CaseList,EvaSubmitDialog}.tsx`
- focused domain/API/SPA parity, matrix, queue, dashboard, mapper and submission tests.

## Offline proof

- `node verify-all.mjs`: **8 passed, 0 failed, 13 expected skips**.
- SPA: **453 passed** plus production Vite build.
- Data API: **618 passed** plus TypeScript build.
- Domain: **1,132 passed** (including the shared TS/Python parity corpus).
- Orchestration: **401 passed** plus TypeScript build.
- `git diff --check`: clean.

## Remaining release/live gates

- Pass the normal repository and CI checks, merge, then rebuild the tracked API deployment bundle and SPA
  artifact from merged `main`. The retired reciprocal AI-review workflow is not a release gate.
- Deploy API + SPA (orchestration source already delegates to the API and has no new local evaluator).
- Take the ticket-specified backup, idempotently recompute every active case, and retain a residual ledger.
- Independently compare DB status/queue membership, API counts and deployed SPA counts; specifically prove
  QDOS26079 and every incomplete former-Review case moved to Not ready or Held with its checklist reason.
- Record the live evidence in `verification.md` only in the orchestrating/verifier loop.

## prior first pass — 2026-07-08 (superseded by the reopened acceptance)

The material below records the earlier implementation and live proof. Its `needs_review -> Review` rule
is deliberately retained as history but is no longer the specification.

## What changed (prior)

## What changed

**Queue routing (`packages/domain/src/model/queues.ts`)** — per the operator direction:
- `needs_review` MOVED from the "Not ready" queue into the **Review** queue
  (`review.statuses = ['needs_review', 'ready_for_eva']`). Review is now the human-in-the-loop
  queue: flagged-for-a-person OR complete-and-awaiting-the-final-check.
- `statusToStage` changed **in lockstep** (`needs_review` → the `review` funnel stage) so the
  dashboard pipeline strip, the queue tabs, and the dashboard tiles agree — they are all
  single-sourced through `statusToQueue`/`statusToStage`/`filterQueue` (TKT-012 contract held;
  `services/data-api/src/features/cases/dashboard-routes.ts` needed **no change** by construction).
- SPA copy updated to match: Review empty-state hint + Held action label
  (`apps/web/src/features/cases/CaseList.tsx`), the dashboard quick-action label ("Check cases waiting
  for review") + stale stage-route comment (`apps/web/src/features/dashboard/Dashboard.tsx`). The Review
  queue now spans two statuses, so the existing status filter appears on it automatically.

**Readiness starvation** — fixed by the TKT-129/109 prefill (see those changes.md): the inspection
item on image-based-provider cases no longer blocks `fieldsValid`.

## Tests
- **New** `packages/domain/src/model/queues.test.ts`: needs_review → review (queue + stage),
  ready_for_eva stays review, the Not-ready set, Held/terminals, the no-status-in-two-queues
  partition invariant, and queue↔funnel lockstep.
- `services/data-api/src/features/cases/dashboard-routes.test.ts` pipeline expectations updated (not_ready 2 / review 2 /
  submitted 1 for the fixture set).
- Suites green: domain 962 / api 279 / @cs/web 312 / orch 170.

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
and [TKT-129 evidence/delta-apply-output-2026-07-08.txt](../../verify/TKT-129-image-based-inspection-done/evidence/delta-apply-output-2026-07-08.txt).

## Live proof (deployed SPA, staff session)
- A `needs_review` case (**QDOS26029**, YT13UTV) renders **in the Review queue**:
  [evidence/review-queue-needs-review-case-2026-07-08.png](./evidence-manifest.json)
  (queue page + tab counts: [evidence/review-queue-live-2026-07-08.png](./evidence-manifest.json)).
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
# Operator ruling — 2026-07-13

Remove the blanket field-review blocker. Populated, valid, non-conflicting values require no extra
confirmation; only missing, invalid or genuinely conflicting values block readiness. Viewing is read-only.
Implementation and live recomputation remain pending.
