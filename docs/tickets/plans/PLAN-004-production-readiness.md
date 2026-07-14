---
id: PLAN-004
title: Production readiness and lifecycle completion
status: active
tickets: [TKT-041, TKT-102, TKT-149, TKT-150, TKT-151, TKT-152, TKT-153, TKT-154, TKT-155, TKT-156, TKT-157, TKT-158, TKT-159, TKT-160, TKT-161, TKT-162, TKT-163, TKT-164, TKT-165, TKT-166, TKT-167, TKT-168, TKT-169, TKT-170, TKT-171, TKT-172, TKT-173, TKT-174, TKT-175, TKT-176, TKT-177, TKT-178, TKT-179, TKT-180, TKT-181, TKT-182, TKT-183, TKT-184, TKT-185, TKT-186, TKT-187, TKT-188, TKT-189, TKT-190, TKT-191, TKT-192, TKT-193, TKT-194, TKT-195, TKT-197, TKT-198, TKT-199, TKT-200]
depends-on: []
---

# PLAN-004 — Production readiness and lifecycle completion

## Context
The operator supplied a production-readiness programme on 2026-07-12 and a large evidence-backed refinement drop on 2026-07-13. Together they cover review discipline, staff access, intake and correlation correctness, vehicle enrichment, case editing, evidence and Archive lifecycle, email taxonomy, pre-case work, constrained agent ingestion, handler-facing usability, production cutover and final remediation. Existing tickets are reused or reopened where they already own the behavior; new material is distilled into atomic members rather than duplicating those owners.

This plan has **53 members**. It sequences implementation and verification, but it does not weaken any member's own acceptance or live-proof boundary. TKT-196 is deliberately not a member.

## Decisions recorded
- A case belongs in Review only when it could theoretically be submitted to EVA: every required field is present, its accepted image set satisfies the image rules, and no unresolved blocker remains.
- A populated, valid field that does not conflict with another credible source needs no separate “reviewed” acknowledgement. Missing, invalid or genuinely conflicting data blocks readiness; simply viewing a case/value is read-only and must not write, clear a conflict or create an audit event.
- Image-only work is identified by registration until instructions supply the provider and Case/PO; its registration-named archive folder is then adopted into the Case/PO folder idempotently.
- Triage, pre-instruction and other approved early material may create a first-class pre-case identity and evidence holding record without a Case/PO. The original email, images and documents are retained and later adopted atomically into the uniquely matched or handler-selected case without duplicate or loss.
- Vehicle details and mileage use one canonical enrichment path; estimates remain auditable, range-bearing and capable of abstaining.
- Staff authentication remains Microsoft Entra/MSAL with named staff display identities and explicit `CollisionSpike.User` / `CollisionSpike.Superuser` assignments. There are no local/shared/default passwords or in-app credential lifecycle; Microsoft owns password, MFA and account management.
- Repository email, image and document material is fully authorized for project analysis. Raw image bytes may be sent to the project's configured multimodal assistant where the approved assistant workflow requires them; secret redaction, access control, approved-processor scope, residency/terms and the ban on arbitrary egress or publication remain binding.
- A definite cancellation with an exact single eligible case target auto-attaches and moves that case to Held in the same durable operation. Ambiguity means a concrete zero/multiple/conflicting/ineligible target or uncertain cancellation meaning; ambiguous mail mutates no case until resolved, and cancellation handling never auto-closes, completes or removes a case.
- A Tractable delivery with an exact single eligible case target auto-attaches its email/PDF and extracts, deduplicates, classifies and persists its submitted vehicle images. Only concrete zero/multiple/conflicting target evidence uses manual resolution; no-case arrivals use the pre-case holding/adoption path.
- Production cutover is planned but **blocked**. No live step is authorized until one named window has
  the dated signed/checksummed job sheet, an enabled/authenticated/contract-verified production EVA API,
  and an independently confirmed production Archive root with explicit/proven least-privilege
  write/rename/merge/retarget authority. Test, mirror, configured-default and Viewer-only roots do not
  satisfy that gate. After all global gates pass, EVA, the approved Archive or read-only Outlook may
  each supply a qualifying case-specific completion signal.
- Outlook remains read-only for reconciliation and cutover. Ordinary verification writes stay inside
  an explicitly approved non-production/test boundary. Production Archive/database work additionally
  requires backup/restore proof, the frozen deterministic dry-run hash, exact ledger scope and named
  final-window approval in TKT-178.
- Live application proof never uses mock, seeded or disposable cases/data. Artificial edge states belong in offline or isolated non-live environments; live proof uses naturally occurring, operator-designated work, and unavailable live shapes remain PENDING rather than being manufactured.
- Evidence uses one tri-state “Photo use” decision: “Not decided”, “Use for EVA” or “Do not use”. Registration visibility remains separate, and Overview implies registration-visible in the same save. Repeated app concepts use one shared semantic Fluent icon mapping with visible/accessibly named text.
- Existing human case decisions and source evidence are preserved during remediation; the retired wipe/rebuild path is not revived.
- User-facing copy follows the handler-language rule in `AGENTS.md`; the private contextual rationale supplied for inspection policy is deliberately not reproduced in application or deployment copy.

## Ticket sequence

### 1. Governance, authority and live control plane (5)

1. [TKT-149](../done/TKT-149-reciprocal-pr-reviews/TKT-149-reciprocal-pr-reviews.md) — retire the mandatory Claude+Codex PR-review workflow per the 2026-07-14 operator ruling; retain normal checks and unrelated safety hooks.
2. [TKT-199](../backlog/TKT-199-repository-data-authority-docs/TKT-199-repository-data-authority-docs.md) — make repository/raw-image authority and retained security/egress boundaries unambiguous.
3. [TKT-195](../backlog/TKT-195-entra-staff-access-management/TKT-195-entra-staff-access-management.md) — establish named Entra staff identity and explicit User/Superuser assignment before broad signed-in proof.
4. [TKT-159](../backlog/TKT-159-feature-gate-intent-audit/TKT-159-feature-gate-intent-audit.md) — reconcile code, registry and live gates, including conditional EVA use.
5. [TKT-164](../done/TKT-164-inbound-counts-500/TKT-164-inbound-counts-500.md) — retain the repaired inbound-count path as the live dashboard baseline.

### 2. Canonical data, save and readiness spine (5)

1. [TKT-150](../now/TKT-150-claimant-extraction-held-audit/TKT-150-claimant-extraction-held-audit.md) — restore and account for claimant extraction before broad remediation.
2. [TKT-151](../backlog/TKT-151-vehicle-enrichment-completeness/TKT-151-vehicle-enrichment-completeness.md) — make vehicle enrichment complete and explicit about unresolved registrations.
3. [TKT-152](../backlog/TKT-152-canonical-mileage-estimator/TKT-152-canonical-mileage-estimator.md) — consolidate vehicle lookup/mileage estimation onto one auditable path.
4. [TKT-153](../backlog/TKT-153-explicit-case-save/TKT-153-explicit-case-save.md) — make staff edits one reviewed, concurrency-safe save rather than competing field writes.
5. [TKT-168](../now/TKT-168-unify-not-ready-language/TKT-168-unify-not-ready-language.md) — make the visible Not Ready reason agree with the canonical readiness evaluator and field-review ruling.

### 3. Evidence-write and Archive foundations (6)

1. [TKT-165](../now/TKT-165-add-evidence-upload/TKT-165-add-evidence-upload.md) — remove the live Add evidence false-success P0.
2. [TKT-166](../backlog/TKT-166-manual-intake-evidence-upload/TKT-166-manual-intake-evidence-upload.md) — persist instruction and extra files through the same resumable evidence lifecycle.
3. [TKT-175](../backlog/TKT-175-archive-deletion-resilience-investigation/TKT-175-archive-deletion-resilience-investigation.md) — establish the evidence-backed failure/threat matrix before designing Archive-side reconciliation.
4. [TKT-160](../backlog/TKT-160-delete-case-image/TKT-160-delete-case-image.md) — implement intentional image deletion across canonical stores without confusing it with out-of-band loss.
5. [TKT-162](../backlog/TKT-162-nested-audit-archive/TKT-162-nested-audit-archive.md) — normalize QDOS audit work beneath the standard case Archive identity.
6. [TKT-174](../backlog/TKT-174-archive-evidence-preview/TKT-174-archive-evidence-preview.md) — make Archive preview loading, failure, retry and larger view truthful.

### 4. Photo decision, checking and completeness policy (5)

1. [TKT-179](../backlog/TKT-179-evidence-image-decision-controls/TKT-179-evidence-image-decision-controls.md) — establish the single tri-state Photo use contract.
2. [TKT-181](../backlog/TKT-181-truthful-image-analysis-states/TKT-181-truthful-image-analysis-states.md) — give image checking finite, recoverable states distinct from preview loading.
3. [TKT-161](../backlog/TKT-161-image-based-reflection-policy/TKT-161-image-based-reflection-policy.md) — apply the approved reflection policy through the canonical decision/readiness contract.
4. [TKT-167](../backlog/TKT-167-image-gap-chasers/TKT-167-image-gap-chasers.md) — retain targeted chasers until every actual photo rule passes.
5. [TKT-198](../backlog/TKT-198-wrong-vehicle-evidence-detection/TKT-198-wrong-vehicle-evidence-detection.md) — calibrate and surface different-vehicle evidence through TKT-179 without deletion or unsupported exclusion.

### 5. Case identity, numbering and duplicate resolution (5)

1. [TKT-171](../backlog/TKT-171-four-digit-case-po-sequence/TKT-171-four-digit-case-po-sequence.md) — make the canonical Case/PO contract safe beyond sequence 999; TKT-004 remains the allocator dependency.
2. [TKT-172](../backlog/TKT-172-manual-intake-duplicate-guard/TKT-172-manual-intake-duplicate-guard.md) — stop Manual Intake before it creates an avoidable duplicate while permitting genuinely separate accidents.
3. [TKT-177](../backlog/TKT-177-duplicate-case-resolution-workspace/TKT-177-duplicate-case-resolution-workspace.md) — provide evidence-based merge/mark-distinct resolution with safe reversal boundaries.
4. [TKT-163](../backlog/TKT-163-merge-dialog-layout/TKT-163-merge-dialog-layout.md) — make the canonical merge decision usable after its preservation contract is fixed.
5. [TKT-197](../backlog/TKT-197-linked-email-identity-display/TKT-197-linked-email-identity-display.md) — expose source-aware registration/reference identity without view-time mutation or borrowed email references.

### 6. Pre-case holding and specialised intake (4)

1. [TKT-193](../backlog/TKT-193-precase-evidence-holding-adoption/TKT-193-precase-evidence-holding-adoption.md) — build the one canonical pre-case identity/evidence holding and atomic adoption seam.
2. [TKT-192](../backlog/TKT-192-triage-precase-category/TKT-192-triage-precase-category.md) — route Triage into that seam without a case or Case/PO.
3. [TKT-102](../now/TKT-102-tractable-received-handling/TKT-102-tractable-received-handling.md) — auto-attach exact-single Tractable deliveries and persist their extracted images; use TKT-193 when no case exists.
4. [TKT-188](../backlog/TKT-188-report-amendment-classification-reconstruction/TKT-188-report-amendment-classification-reconstruction.md) — keep amendments with the existing matter or the same guarded holding/adoption path.

### 7. Email correlation, taxonomy and required actions (7)

1. [TKT-183](../backlog/TKT-183-name-variant-case-correlation/TKT-183-name-variant-case-correlation.md) — tolerate full-name/initial variants inside the existing strong-key hierarchy without name-only attachment.
2. [TKT-170](../now/TKT-170-website-enquiry-classification/TKT-170-website-enquiry-classification.md) — keep website enquiries outside the existing-case/new-work lifecycle.
3. [TKT-184](../backlog/TKT-184-out-of-office-no-action/TKT-184-out-of-office-no-action.md) — classify grounded automatic replies as no action and never mint work.
4. [TKT-186](../backlog/TKT-186-provider-update-chase-category/TKT-186-provider-update-chase-category.md) — give provider progress chases their own never-mint category and precedence.
5. [TKT-187](../backlog/TKT-187-multi-case-provider-chase-linking/TKT-187-multi-case-provider-chase-linking.md) — associate one canonical chase with every independently resolved case item.
6. [TKT-041](../now/TKT-041-cancelled-case/TKT-041-cancelled-case.md) — replace propose-only cancellation handling with exact-single auto-attach plus Held, concrete ambiguity and never auto-close.
7. [TKT-173](../backlog/TKT-173-ax-instruction-acceptance-action/TKT-173-ax-instruction-acceptance-action.md) — make the external AX accept/decline action prominent without claiming success from navigation.

### 8. Suggestion provenance, usefulness and explanation (3)

1. [TKT-185](../backlog/TKT-185-override-provenance-audit/TKT-185-override-provenance-audit.md) — determine whether staff, rules, accepted suggestions, AI or another writer caused each override before changing anything.
2. [TKT-191](../backlog/TKT-191-actionable-email-suggestions/TKT-191-actionable-email-suggestions.md) — add reply/urgency advice only after the override/mass-email cohorts prove it justified.
3. [TKT-194](../backlog/TKT-194-unidentified-reason-explanation/TKT-194-unidentified-reason-explanation.md) — explain concrete missing/conflicting evidence and keep pending suggestions separate from current classification.

### 9. Constrained inbound evidence channels (3)

1. [TKT-154](../backlog/TKT-154-mcp-image-ingestion/TKT-154-mcp-image-ingestion.md) — add least-privilege registration-based image ingestion through the canonical evidence seam.
2. [TKT-156](../backlog/TKT-156-chaser-file-request/TKT-156-chaser-file-request.md) — put an active Archive upload link into every applicable image chaser.
3. [TKT-200](../now/TKT-200-guided-capture-sessions/TKT-200-guided-capture-sessions.md) — add a
   tightly scoped guided-photo session that materialises only reviewed submissions through the same
   canonical evidence seam; PR #83 remains offline until its public-ingress, device and live gates pass.

### 10. Handler-facing convergence and polish (8)

1. [TKT-155](../now/TKT-155-dashboard-three-state-layout/TKT-155-dashboard-three-state-layout.md) — converge the dashboard on Not Ready, Review and Held after the canonical evaluator is stable.
2. [TKT-176](../backlog/TKT-176-dashboard-period-wording/TKT-176-dashboard-period-wording.md) — use the approved period wording without changing counts.
3. [TKT-169](../now/TKT-169-email-hover-preview-bounds/TKT-169-email-hover-preview-bounds.md) — keep email hover previews within the viewport.
4. [TKT-182](../backlog/TKT-182-long-reference-layout/TKT-182-long-reference-layout.md) — contain long references without hiding their complete accessible value.
5. [TKT-190](../backlog/TKT-190-inbox-case-po-status-display/TKT-190-inbox-case-po-status-display.md) — make inbox relationship status resolve the complete current Case/PO.
6. [TKT-189](../backlog/TKT-189-search-result-affordance/TKT-189-search-result-affordance.md) — make case/email search results visibly and accessibly actionable.
7. [TKT-180](../backlog/TKT-180-icon-semantic-consistency/TKT-180-icon-semantic-consistency.md) — apply the single semantic Fluent icon map across repeated concepts.
8. [TKT-157](../backlog/TKT-157-handler-copy-audit/TKT-157-handler-copy-audit.md) — finish with a cross-surface handler-language sweep after the new states/actions land.

### 11. Production cutover and final residual remediation (2)

1. [TKT-178](../blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md) — harden and rehearse the future cutover plan offline. Execution remains blocked until the signed job sheet, verified EVA API, approved production Archive root/write scope, restore proof, frozen dry-run hash and named live-window approval all exist.
2. [TKT-158](../backlog/TKT-158-case-remediation-rerun/TKT-158-case-remediation-rerun.md) — only after cutover leaves canonical cases/folders, rerun defect-owned derived state and account for every residual without reviving wipe/rebuild.

## Related existing tickets (not PLAN-004 members)

These tickets retain their own status/plan membership but are dependencies, prior art or required verification surfaces:

| Relationship | Existing tickets |
|---|---|
| Case identity, correlation, merge and reconstruction | TKT-004, TKT-023, TKT-034, TKT-052, TKT-059, TKT-092, TKT-093, TKT-118, TKT-119, TKT-139, TKT-140, TKT-141, TKT-145 |
| Completion, readiness and queue truth | TKT-094, TKT-095, TKT-096, TKT-129, TKT-130 |
| Evidence, photo and assistant foundations | TKT-002, TKT-003, TKT-047, TKT-064, TKT-068, TKT-089, TKT-112, TKT-123, TKT-126, TKT-131, TKT-133, TKT-143, TKT-146, TKT-148 |
| UI, search, docs, enrichment and platform surfaces | TKT-009, TKT-020, TKT-024, TKT-044, TKT-072, TKT-110, TKT-120, TKT-134, TKT-138 |

TKT-130 carries the binding valid/non-conflicting field and view-only-no-mutation ruling; TKT-068 carries the configured multimodal assistant path; TKT-004, TKT-052, TKT-093, TKT-095, TKT-145 and TKT-146 remain explicit implementation/verification dependencies for numbering, merge, auto-attachment, completion and evidence lifecycle respectively.

## Verification / close-out
- All 53 frontmatter members reach `done` only through an independent `ticket-verifier` verdict; an implementer does not certify its own ticket, and code-reading alone is never sufficient for live acceptance.
- Every member acceptance line has one concrete offline/isolated artifact and its required signed-in/live artifact or an honest PENDING reason. Artificial states are not seeded into the live app to obtain a green verdict.
- Every implementation PR passes its normal repository/CI checks. No mandatory AI-review marker workflow is
  part of close-out; required schema/config deploy order, rollback and live health proof remain per ticket.
- Active/verify related tickets that supply a member's prerequisite contract are independently verified before that dependent member closes, even though they are not PLAN-004 members.
- Entra assignment/revocation, repository/configured-assistant authority, no-unapproved-egress controls, email no-mint/auto-Held paths, pre-case adoption and evidence/photo decisions receive signed-in proof at their real authorized surfaces.
- TKT-200 cannot close until the CollisionSpike canonical OpenAPI and the CollisionCapture vendored
  contract/source lock agree at reviewed commits, and deployed public ingress plus physical iPhone and
  Android device proof satisfy its acceptance without production Archive writes.
- TKT-178 retains the approved job-sheet hash/signature, successful authenticated production EVA
  contract probe, exact production Archive root plus acting-identity write/rename/merge/retarget
  authorization, backup/restore proof, frozen dry-run hash, per-row checkpoints and independent
  outcome-class sample. Cutover is not certified from planning, fixtures, configured defaults,
  Viewer-only access or configuration readback.
- TKT-158's final residual ledger accounts for every targeted case as repaired, source absent, conflicting, intentionally held or failed with a named follow-up; DB/API/SPA/Archive invariants and retained source evidence agree.
- The plan becomes `done` only when all 53 members are `done`, the related prerequisite surfaces used by them are verified, and an independent close-out review confirms no unresolved production-readiness blocker was hidden by a deferred or fabricated live test.

## Deferred
- [TKT-196](../backlog/TKT-196-video-frame-evidence-extraction/TKT-196-video-frame-evidence-extraction.md) is a standalone P3 enhancement and is deliberately deferred outside PLAN-004.
- The vendor/API integration in TKT-104 remains separately blocked; PLAN-004's Tractable requirement is the grounded email/PDF/image path in TKT-102.
- Broader organisational data-protection policy and Azure subscription commercial conversion remain outside this programme. TKT-199's repository/configured-assistant authority and its security/egress exclusions are in scope and are not deferred.
- No unavailable live scenario will be replaced by mock/seed data; it remains PENDING after isolated proof until naturally occurring, operator-approved live evidence exists.
