# Verification — TKT-130: needs_review cases belong in the Review queue — readiness wrongly piles everything into Not Ready

## Verdict
PENDING

## Evidence
(implementer-gathered, 2026-07-08 — awaiting the independent verifier)
- needs_review case QDOS26029 rendered IN the Review queue on the deployed SPA —
  [evidence/review-queue-needs-review-case-2026-07-08.png](./evidence/review-queue-needs-review-case-2026-07-08.png)
  (+ tab counts Not ready 154 / Review 135 / Held 59:
  [evidence/review-queue-live-2026-07-08.png](./evidence/review-queue-live-2026-07-08.png))
- Live re-evaluation movement (needs_review→missing_images 109; missing_required_fields→
  ready_for_eva 23; ready_for_eva 0→23) — changes.md + 
  [evidence/post-reeval-state-2026-07-08.txt](./evidence/post-reeval-state-2026-07-08.txt)
- A.QDOS26029 image-rule detail (why it evaluates missing_images honestly) —
  [evidence/aqdos26029-image-rule-detail-2026-07-08.txt](./evidence/aqdos26029-image-rule-detail-2026-07-08.txt)

## Pending / gaps
- Independent verifier pass.
- The "A.QDOS26029-shaped → ready_for_eva" acceptance is proven by the 23 movers (e.g. A.QDOS26001,
  QDOS26050); A.QDOS26029 ITSELF stays missing_images due to a genuine image-role coverage gap
  (zero classified overview-with-registration) — flagged as a follow-up ticket suggestion.

## How to re-verify
1. Deployed SPA → Queues → Review: contains needs_review cases (status filter shows both statuses);
   dashboard tiles and the pipeline strip agree with the queue tab counts.
2. `SELECT s.name, count(*) FROM case_ c JOIN choice_case_status s ON s.code=c.status_code GROUP BY 1`
   — compare with changes.md's after-distribution.
3. `node scripts/…` not needed — domain unit test `packages/domain/src/model/queues.test.ts` pins the
   mapping.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Independent live SPA pass: QDOS26029 (needs_review) renders inside the Review queue (1 of 136) with the funnel at REVIEW; the Ready-for-EVA status filter returns exactly the 23 recorded movers (A.QDOS26001, A.PCH26010 et al) — first non-zero population live; every counting surface agrees (nav badges = queue tabs = dashboard pipeline = QUEUES snapshot at 155/136/59; drift from 154/135/59 is live intake); movement summary recorded in changes.md + evidence and corroborated by the orchestrator data pass (140/109/76/23 distribution). No engineering language in queue labels or filters. Expected absence: A.QDOS26029 itself honestly evaluates missing_images (role-unknown backfill residue) — that follow-up IS raised as TKT-131.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
