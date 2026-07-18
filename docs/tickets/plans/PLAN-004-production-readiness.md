---
id: PLAN-004
title: Production readiness and lifecycle completion
status: active
tickets: [TKT-041, TKT-102, TKT-149, TKT-151, TKT-152, TKT-153, TKT-154, TKT-155, TKT-156, TKT-157, TKT-158, TKT-159, TKT-160, TKT-161, TKT-162, TKT-163, TKT-164, TKT-165, TKT-166, TKT-167, TKT-168, TKT-169, TKT-170, TKT-171, TKT-172, TKT-173, TKT-174, TKT-175, TKT-176, TKT-177, TKT-178, TKT-179, TKT-180, TKT-181, TKT-182, TKT-183, TKT-184, TKT-185, TKT-186, TKT-187, TKT-188, TKT-189, TKT-190, TKT-191, TKT-192, TKT-193, TKT-194, TKT-195, TKT-197, TKT-198, TKT-199, TKT-200, TKT-205, TKT-206, TKT-216, TKT-217, TKT-218, TKT-219, TKT-221, TKT-222, TKT-223, TKT-224, TKT-225]
depends-on: []
---

# PLAN-004 — Production readiness and lifecycle completion

## Outcome

Complete the pre-release product around reliable intake, canonical case identity, evidence handling,
Archive behavior, handler-facing workflows, security and production reconciliation.

## Decisions

- Ticket acceptance and current live evidence determine readiness; merged code alone is not proof.
- Stable HTTP contracts, database identifiers and persisted numeric codes change only in an explicitly
  scoped member ticket.
- Production writes require separate, named authorization and do not follow from plan membership.
- Archive writes remain confined to approved scope and every byte-changing action needs reversible,
  hash-backed evidence.
- TKT-216 owns the EVA submission route/body defect. Repository cleanup may not hide or absorb it.

## Delivery groups

1. Governance, access and control.
2. Canonical case data, save behavior and readiness.
3. Evidence and Archive foundations.
4. Photo decisions and image checks.
5. Identity, numbering and duplicate resolution.
6. Intake, email correlation and classification.
7. Handler-facing convergence.
8. Approved production reconciliation.

## Close-out

Every member must be independently verified. Blocked tickets remain visible with their unavailable input
or authorization named; they are never treated as complete by plan aggregation.

<!-- GENERATED:PROGRESS -->
## Computed progress

**3/63 done (4%).**

| Status | Count |
|---|---:|
| Now | 14 |
| Verify | 12 |
| Done | 3 |
| Next | 0 |
| Backlog | 33 |
| Blocked | 1 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-041](../now/TKT-041-cancelled-case/TKT-041-cancelled-case.md) | now | Cancelled/closed-case emails have no home (no cancellation concept) |
| [TKT-102](../now/TKT-102-tractable-received-handling/TKT-102-tractable-received-handling.md) | now | Tractable received-email handling — categorise, match to case, parse PDF, extract images |
| [TKT-149](../done/TKT-149-reciprocal-pr-reviews/TKT-149-reciprocal-pr-reviews.md) | done | Retire mandatory reciprocal Claude and Codex PR reviews |
| [TKT-151](../verify/TKT-151-vehicle-enrichment-completeness/TKT-151-vehicle-enrichment-completeness.md) | verify | Complete vehicle enrichment and warn when a registration cannot be resolved |
| [TKT-152](../verify/TKT-152-canonical-mileage-estimator/TKT-152-canonical-mileage-estimator.md) | verify | Consolidate vehicle lookups and harden the MOT mileage estimator |
| [TKT-153](../verify/TKT-153-explicit-case-save/TKT-153-explicit-case-save.md) | verify | Save case edits explicitly as one reviewed change |
| [TKT-154](../now/TKT-154-mcp-image-ingestion/TKT-154-mcp-image-ingestion.md) | now | Add a constrained MCP path for registration-based image ingestion |
| [TKT-155](../verify/TKT-155-dashboard-three-state-layout/TKT-155-dashboard-three-state-layout.md) | verify | Simplify the dashboard around Not Ready, Review and Held |
| [TKT-156](../verify/TKT-156-chaser-file-request/TKT-156-chaser-file-request.md) | verify | Put an active archive upload link in every image chaser |
| [TKT-157](../backlog/TKT-157-handler-copy-audit/TKT-157-handler-copy-audit.md) | backlog | Remove internal and unnecessary explanatory copy from the app |
| [TKT-158](../backlog/TKT-158-case-remediation-rerun/TKT-158-case-remediation-rerun.md) | backlog | Rerun affected cases safely and account for every residual issue |
| [TKT-159](../now/TKT-159-feature-gate-intent-audit/TKT-159-feature-gate-intent-audit.md) | now | Reconcile every live feature gate with intended production behavior |
| [TKT-160](../now/TKT-160-delete-case-image/TKT-160-delete-case-image.md) | now | Delete an individual case image from every active store |
| [TKT-161](../backlog/TKT-161-image-based-reflection-policy/TKT-161-image-based-reflection-policy.md) | backlog | Allow reflection images for Image Based Assessment cases |
| [TKT-162](../backlog/TKT-162-nested-audit-archive/TKT-162-nested-audit-archive.md) | backlog | Nest QDOS audit work inside the standard case archive folder |
| [TKT-163](../backlog/TKT-163-merge-dialog-layout/TKT-163-merge-dialog-layout.md) | backlog | Repair the merge-case dialog layout |
| [TKT-164](../done/TKT-164-inbound-counts-500/TKT-164-inbound-counts-500.md) | done | Restore the live inbound dashboard counts |
| [TKT-165](../now/TKT-165-add-evidence-upload/TKT-165-add-evidence-upload.md) | now | Make Add evidence upload the selected files |
| [TKT-166](../verify/TKT-166-manual-intake-evidence-upload/TKT-166-manual-intake-evidence-upload.md) | verify | Persist instruction and extra files from Manual Intake |
| [TKT-167](../verify/TKT-167-image-gap-chasers/TKT-167-image-gap-chasers.md) | verify | Keep image chasers available until every image rule passes |
| [TKT-168](../now/TKT-168-unify-not-ready-language/TKT-168-unify-not-ready-language.md) | now | Make Not Ready status language agree with the queue |
| [TKT-169](../verify/TKT-169-email-hover-preview-bounds/TKT-169-email-hover-preview-bounds.md) | verify | Keep long email previews inside the visible window |
| [TKT-170](../verify/TKT-170-website-enquiry-classification/TKT-170-website-enquiry-classification.md) | verify | Classify website contact forms as Website enquiries |
| [TKT-171](../backlog/TKT-171-four-digit-case-po-sequence/TKT-171-four-digit-case-po-sequence.md) | backlog | Keep Case/PO numbering working after 999 |
| [TKT-172](../backlog/TKT-172-manual-intake-duplicate-guard/TKT-172-manual-intake-duplicate-guard.md) | backlog | Check matching registrations before Manual Intake creates a case |
| [TKT-173](../backlog/TKT-173-ax-instruction-acceptance-action/TKT-173-ax-instruction-acceptance-action.md) | backlog | Make AX instruction acceptance impossible to miss |
| [TKT-174](../backlog/TKT-174-archive-evidence-preview/TKT-174-archive-evidence-preview.md) | backlog | Make Archive evidence previews load clearly and open larger |
| [TKT-175](../backlog/TKT-175-archive-deletion-resilience-investigation/TKT-175-archive-deletion-resilience-investigation.md) | backlog | Investigate resilience to direct Archive changes |
| [TKT-176](../backlog/TKT-176-dashboard-period-wording/TKT-176-dashboard-period-wording.md) | backlog | Use clear period wording on the dashboard |
| [TKT-177](../backlog/TKT-177-duplicate-case-resolution-workspace/TKT-177-duplicate-case-resolution-workspace.md) | backlog | Resolve likely duplicate cases in one workspace |
| [TKT-178](../blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md) | blocked | Reconcile active cases and the Archive at production cutover |
| [TKT-179](../backlog/TKT-179-evidence-image-decision-controls/TKT-179-evidence-image-decision-controls.md) | backlog | Make photo decisions explicit |
| [TKT-180](../backlog/TKT-180-icon-semantic-consistency/TKT-180-icon-semantic-consistency.md) | backlog | Use one icon for each app concept |
| [TKT-181](../backlog/TKT-181-truthful-image-analysis-states/TKT-181-truthful-image-analysis-states.md) | backlog | Show truthful photo-checking states |
| [TKT-182](../backlog/TKT-182-long-reference-layout/TKT-182-long-reference-layout.md) | backlog | Keep long email references inside their column |
| [TKT-183](../backlog/TKT-183-name-variant-case-correlation/TKT-183-name-variant-case-correlation.md) | backlog | Match case emails when first names are shortened to initials |
| [TKT-184](../backlog/TKT-184-out-of-office-no-action/TKT-184-out-of-office-no-action.md) | backlog | Treat automatic out-of-office replies as no action needed |
| [TKT-185](../backlog/TKT-185-override-provenance-audit/TKT-185-override-provenance-audit.md) | backlog | Audit what actually caused each category override |
| [TKT-186](../backlog/TKT-186-provider-update-chase-category/TKT-186-provider-update-chase-category.md) | backlog | Separate provider chases from case queries |
| [TKT-187](../backlog/TKT-187-multi-case-provider-chase-linking/TKT-187-multi-case-provider-chase-linking.md) | backlog | Link one provider chase to every referenced case |
| [TKT-188](../backlog/TKT-188-report-amendment-classification-reconstruction/TKT-188-report-amendment-classification-reconstruction.md) | backlog | Keep report amendments with the existing case |
| [TKT-189](../backlog/TKT-189-search-result-affordance/TKT-189-search-result-affordance.md) | backlog | Make search results clearly actionable |
| [TKT-190](../backlog/TKT-190-inbox-case-po-status-display/TKT-190-inbox-case-po-status-display.md) | backlog | Show complete case details in inbox statuses |
| [TKT-191](../backlog/TKT-191-actionable-email-suggestions/TKT-191-actionable-email-suggestions.md) | backlog | Suggest email replies and urgency only when justified |
| [TKT-192](../backlog/TKT-192-triage-precase-category/TKT-192-triage-precase-category.md) | backlog | Keep triage requests outside the case queue until instructions arrive |
| [TKT-193](../backlog/TKT-193-precase-evidence-holding-adoption/TKT-193-precase-evidence-holding-adoption.md) | backlog | Hold pre-case evidence and adopt it when instructions arrive |
| [TKT-194](../now/TKT-194-unidentified-reason-explanation/TKT-194-unidentified-reason-explanation.md) | now | Explain why an email needs sorting |
| [TKT-195](../backlog/TKT-195-entra-staff-access-management/TKT-195-entra-staff-access-management.md) | backlog | Manage staff access with Microsoft work accounts |
| [TKT-197](../backlog/TKT-197-linked-email-identity-display/TKT-197-linked-email-identity-display.md) | backlog | Show a trustworthy registration and email reference on linked emails |
| [TKT-198](../backlog/TKT-198-wrong-vehicle-evidence-detection/TKT-198-wrong-vehicle-evidence-detection.md) | backlog | Flag photos that show a different vehicle |
| [TKT-199](../now/TKT-199-repository-data-authority-docs/TKT-199-repository-data-authority-docs.md) | now | Make repository data authority explicit without weakening security |
| [TKT-200](../now/TKT-200-guided-capture-sessions/TKT-200-guided-capture-sessions.md) | now | Add secure guided photo capture sessions |
| [TKT-205](../now/TKT-205-repository-worktree-governance/TKT-205-repository-worktree-governance.md) | now | Make ticketed worktrees and offline checks the repository workflow |
| [TKT-206](../now/TKT-206-remove-runtime-data-policy-controls/TKT-206-remove-runtime-data-policy-controls.md) | now | Remove privacy-driven runtime data restrictions safely |
| [TKT-216](../now/TKT-216-eva-sentry-route-body-contract/TKT-216-eva-sentry-route-body-contract.md) | now | Repair the EVA Sentry route and body contract |
| [TKT-217](../backlog/TKT-217-bulk-case-registration-lock-budget/TKT-217-bulk-case-registration-lock-budget.md) | backlog | Batch bulk case_ mutations under the registration advisory-lock budget |
| [TKT-218](../backlog/TKT-218-mcp-box-root-single-source/TKT-218-mcp-box-root-single-source.md) | backlog | Consolidate the MCP image-ingest Box test-root to a single source of truth |
| [TKT-219](../verify/TKT-219-retro-parallel-reconstruction/TKT-219-retro-parallel-reconstruction.md) | verify | Run Box and Outlook retro locates in parallel and combine findings, widen triggers, and split dev/live Case-PO adoption |
| [TKT-221](../done/TKT-221-retro-docs-cutover-po/TKT-221-retro-docs-cutover-po.md) | done | Document the retro Case-PO cutover flip, correct retro ADR/spec drift, and register the retro gates |
| [TKT-222](../verify/TKT-222-retro-link-related-emails/TKT-222-retro-link-related-emails.md) | verify | Link every related mailbox email to a reconstructed retro case, not just the original instruction |
| [TKT-223](../verify/TKT-223-retro-force-rerun/TKT-223-retro-force-rerun.md) | verify | Re-run retro reconstruction for previously failed drain rows (force restart) |
| [TKT-224](../backlog/TKT-224-reclassify-stale-abstains/TKT-224-reclassify-stale-abstains.md) | backlog | Re-classify historically mislabeled un-cased emails after classifier fixes |
| [TKT-225](../now/TKT-225-retro-related-attachment-ingest/TKT-225-retro-related-attachment-ingest.md) | now | Parse retro-linked related correspondence into the case — attachments become evidence, details fill the gaps |
<!-- /GENERATED:PROGRESS -->
