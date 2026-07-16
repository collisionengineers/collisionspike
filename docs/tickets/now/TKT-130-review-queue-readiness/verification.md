# Verification — TKT-130: needs_review cases belong in the Review queue — readiness wrongly piles everything into Not Ready

## Verdict
PENDING

## Evidence
(implementer-gathered, 2026-07-08 — awaiting the independent verifier)
- needs_review case QDOS26029 rendered IN the Review queue on the deployed SPA —
  [evidence/review-queue-needs-review-case-2026-07-08.png](./evidence-manifest.json)
  (+ tab counts Not ready 154 / Review 135 / Held 59:
  [evidence/review-queue-live-2026-07-08.png](./evidence-manifest.json))
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
# Verification addendum — field-review ruling, 2026-07-13

PENDING — no prior verdict proves removal of the blanket `needs_review` blocker or the no-write-on-view
invariant. Re-verify with the complete field-state matrix, UI network/audit inspection and a backup-first
live recomputation whose residual ledger explains every remaining blocker.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

FAILED — the binding 2026-07-13 field-review ruling is not implemented in current source or production.
Both still make generic `needs_review` field state an independent blocker and still ship the expressly
forbidden `No unresolved field reviews` checklist item. The older 2026-07-09 `VERIFIED-LIVE` result tested
the superseded opposite queue rule and is invalid for current acceptance.

## Evidence

- The controlling ruling says generic `needs_review` must not independently block, populated
  non-conflicting values need no confirmation, view-only navigation must write nothing, genuine conflicts
  alone require resolution, and every surface must never display `No unresolved field reviews`
  (`TKT-130...md:61-90`). The operator evidence says that exact blocker appeared and had no way to clear it
  (`evidence/followup-2026-07-13/issue.md:1-9`).
- Current source directly contradicts that ruling: `packages/domain/src/contracts/case-status.ts:203-210`
  defines every `needs_review` or `conflict` field as unresolved; `:329-343` emits `No unresolved field
  reviews`; and `:451-457` routes otherwise complete cases with either state to `needs_review`. Current
  tests also expect the blanket `no-conflicts` failure (`canonical-readiness.test.ts:101-110`).
- Fresh production retrieval on 2026-07-14 loaded `/assets/index-CbUqeEAY.js` (SHA-256
  `CEAE61DFE54EC9072E0AE6A154C0066A05FD495FEDA48D8B0560E54B1F8E4A0F`). Its compiled evaluator filters
  fields with `reviewState === "needs_review" || "conflict"`, renders `label:"No unresolved field
  reviews"`, and lists `Review: ...`. This is direct live disconfirmation, not merely missing deployment
  evidence.
- The pre-ruling canonical work does correctly map `needs_review` to Not ready and `ready_for_eva` alone
  to Review (`packages/domain/src/model/queues.test.ts:27-53`) and shares a readiness adapter for
  checklist/submission (`case-readiness.ts:54-101`), but it deliberately included every `needs_review`
  field as a blocker. `changes.md:147-151` explicitly records that removal of the blanket blocker,
  read-only viewing semantics, implementation and live recomputation remain pending.
- prior screenshots are now negative evidence: `review-queue-needs-review-case-2026-07-08.png` shows
  QDOS26029 in Review with claimant `—`, exactly the incomplete shape the superseding 2026-07-12 acceptance
  forbids. They cannot certify the current queue contract.
- No backup-first active-case recomputation, QDOS26079 disposition, residual ledger, DB/API/SPA parity
  comparison or EVA-submission counter-probe exists for either the 12 July rule or the 13 July field ruling
  (`TKT-130...md:43-46,78-90`; `changes.md:61-69`).

## Pending / gaps

- Implement the 13 July semantics: populated valid non-conflicting values must pass regardless of generic
  `needs_review`; only missing, invalid or genuine source conflict may block.
- Provide field/candidate/source conflict UI and an explicit one-field resolution that preserves all
  unrelated values/lineage and records the chosen value/source.
- Prove opening/viewing/entering Review performs no update, lineage change, conflict clear or audit write;
  prove explicit edits, suggestion accepts, conflict resolution and submission remain audited.
- Deploy the corrected domain/API/SPA artifacts, then run the required backup-first idempotent
  recomputation over every active case. QDOS26079 and all incomplete Review cases need specific
  outcomes/reasons.
- Produce the residual ledger, independent database/API/SPA membership/count reconciliation and
  stale-status EVA submit counter-probe. No current artifact satisfies these live acceptance lines.

## How to re-verify

1. Before deployment, add the required field-state contract matrix for every required field:
   populated-valid, missing, invalid, one-source, agreeing-multi-source and conflicting-multi-source.
   Assert generic `needs_review` alone never blocks and the forbidden label is absent from source/build.
2. Add interaction/network/audit tests proving view-only navigation sends no update/audit request and
   resolving one genuine conflict changes only that field, records chosen value/source and clears only
   that conflict.
3. Deploy the exact reviewed domain/API/SPA release. Take the required backup, run the recomputation
   idempotently across all active cases twice, and retain before/after plus residual-reason ledgers.
4. Reconcile database status/queue membership, authenticated API results, dashboard counts and signed-in
   SPA rows independently; trace QDOS26079 and each residual exception to a specific blocker.
5. In Chrome, prove Review contains only complete cases, Not ready shows specific actionable reasons, Held
   precedence remains, and `No unresolved field reviews` never renders. Finish with a
   stale-ready/incomplete EVA submission counter-probe proving the server rejects it.

## Confidence + unread surfaces

HIGH: the complete ticket folder and all evidence images/text were read, the binding follow-up was
applied, current evaluator/queue/checklist/submission source and tests were inspected, Git/deployment
ancestry was checked, and the production JS provides direct live contradiction. Unread/unavailable live
surfaces are current authenticated API payloads, database rows, audit rows and a signed-in QDOS26079 trace;
their absence cannot change the FAILED verdict because both current source and deployed code violate
explicit acceptance.
