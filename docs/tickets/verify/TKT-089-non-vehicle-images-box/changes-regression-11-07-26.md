# Regression follow-up — 2026-07-11

PR 55's second functionality review found that the automatic non-vehicle suppression can hide
genuine evidence and gives staff no durable recovery path. The 3.2:1 shape rule can discard a
low-resolution panoramic vehicle photo before classification. A low-confidence `other` result can
exclude an image even when the result also reports a readable registration. Successful retries do
not reliably clear an earlier automatic exclusion, and the case-screen role/exclusion controls are
currently local-only. Accepting an image-role suggestion can also leave the image unavailable for
EVA because `accepted_for_eva` remains false.

## Acceptance

- The parser and email attachment filters keep plausible panoramic vehicle images for classification.
- Automatic non-vehicle exclusion requires a high-confidence result with no readable registration signal.
- Evidence records retain the source of an exclusion decision so classifier retries cannot overwrite staff, provider, cleanup, or legacy decisions.
- A later successful vehicle classification clears only an earlier classifier-owned exclusion and restores the image's accepted state.
- Staff can review automatically excluded photos, persist role/registration/acceptance/exclusion changes, and recover a false positive across a page reload.
- A staff include/exclude decision survives later classifier retries.
- Accepting a vehicle-role suggestion makes an otherwise eligible extracted image usable and clears only a classifier-owned non-vehicle exclusion.
- Tests cover automatic retry recovery, protected human/provider/cleanup decisions, durable UI review, readiness, and Archive eligibility.

## Implementation

- Parser engine `v2.16` and the email image filter retain plausible panoramic photos; suppression now
  depends on a high-confidence non-vehicle result with no registration signal (`56161d3`).
- Added per-field decision ownership, classifier compare-and-set rules, durable staff controls and
  truthful suggestion-accept conflicts (`add9e74`, `08dc5d5`).
- Staff, suggestion and classifier recovery all write an Archive-mirror generation in the evidence
  transaction. An eternal durable monitor retries the existing archive activity and acknowledges only
  after exact-row verification (`08dc5d5`).
- Status generations are evaluated and acknowledged atomically; failures remain pending for the sweep
  rather than becoming false successes (`0e30f89`, `08dc5d5`).
- Every case/evidence mutation now follows the same case → evidence → Archive-work lock order and
  rejects a retired source. Staff, assistant and provider uploads request their Archive copy in the
  same transaction as the evidence write (`070a0bf`).
- Archive copying now claims the exact evidence decision before external work, so a staff exclusion
  invalidates the claim and a stale upload cannot be stamped as current. Pending work is deferred
  with fair retry timing, preventing non-ready rows from starving newer eligible photos (`070a0bf`).
- Merge collision handling transfers or completes pending Archive work alongside the surviving
  evidence row, and completion acknowledges only the claimed generation (`070a0bf`).
- The ownership migration now safely parses legacy audit snapshots and infers ownership only from an
  actual before/after field change. Reflection-only records own no exclusion decision, an unchanged
  legacy exclusion reason owns only the exclusion field, and an explicit staff decision always wins
  before classifier inference. The executable fixture
  `migration/assets/schema/tests/tkt089-staff-ownership-fixture.sql` pins those cases. The migration
  must be rerun after the repaired API deploy to close the rolling-write window; that is deployment
  work, not claimed here as live proof.
- Classifier recovery, staff review and suggestion acceptance now share the same decision-generation
  contract. A high-confidence classifier-owned false positive can be restored, while staff, provider,
  cleanup and legacy-owned decisions remain protected. The API, orchestration and SPA regressions in
  `internal-box-classification.test.ts`, `archive-mirror-outbox.test.ts`,
  `archive-mirror-monitor.test.ts` and `evidence-review.test.ts` exercise recovery, stale claims,
  Archive eligibility and reload-safe controls.
