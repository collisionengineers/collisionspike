---
id: PLAN-004
title: Production readiness and lifecycle completion
status: active
tickets: [TKT-149, TKT-150, TKT-151, TKT-152, TKT-153, TKT-154, TKT-155, TKT-156, TKT-157, TKT-158, TKT-159, TKT-160, TKT-161, TKT-162, TKT-163, TKT-164, TKT-165, TKT-166, TKT-167]
depends-on: []
---

# PLAN-004 — Production readiness and lifecycle completion

## Context
The operator supplied a production-readiness programme on 2026-07-12 covering reciprocal PR review, intake correctness, vehicle enrichment, case editing, evidence and archive lifecycle, external-agent MCP ingestion, dashboard and form usability, live configuration, and a final safe remediation of affected cases. Existing tickets are reused or reopened where they already own the work; this plan contains only genuinely new atomic tickets.

## Decisions recorded
- A case belongs in Review only when it could theoretically be submitted to EVA: every required field is present, its accepted image set satisfies the image rules, and no unresolved blocker remains.
- Image-only work is identified by registration until instructions supply the provider and Case/PO; its registration-named archive folder is then adopted into the Case/PO folder idempotently.
- Vehicle details and mileage use one canonical enrichment path; estimates remain auditable, range-bearing and capable of abstaining.
- Outlook verification is read-only. Box writes and live upload probes stay inside folder `392761581105` (`test folder`).
- Existing human case decisions and source evidence are preserved during remediation; the retired wipe/rebuild path is not revived.
- User-facing copy follows the handler-language rule in `AGENTS.md`; the private contextual rationale supplied for inspection policy is deliberately not reproduced in application or deployment copy.

## Ticket sequence
1. [TKT-149](../verify/TKT-149-reciprocal-pr-reviews/TKT-149-reciprocal-pr-reviews.md) — install the review guard before this programme opens implementation PRs.
2. [TKT-165](../backlog/TKT-165-add-evidence-upload/TKT-165-add-evidence-upload.md), [TKT-166](../backlog/TKT-166-manual-intake-evidence-upload/TKT-166-manual-intake-evidence-upload.md), and [TKT-153](../backlog/TKT-153-explicit-case-save/TKT-153-explicit-case-save.md) — remove the false-success and competing-write P0 paths.
3. [TKT-150](../backlog/TKT-150-claimant-extraction-held-audit/TKT-150-claimant-extraction-held-audit.md), [TKT-151](../backlog/TKT-151-vehicle-enrichment-completeness/TKT-151-vehicle-enrichment-completeness.md), and [TKT-152](../backlog/TKT-152-canonical-mileage-estimator/TKT-152-canonical-mileage-estimator.md) — repair the data spine.
4. [TKT-160](../backlog/TKT-160-delete-case-image/TKT-160-delete-case-image.md), [TKT-161](../backlog/TKT-161-image-based-reflection-policy/TKT-161-image-based-reflection-policy.md), [TKT-162](../backlog/TKT-162-nested-audit-archive/TKT-162-nested-audit-archive.md), [TKT-167](../backlog/TKT-167-image-gap-chasers/TKT-167-image-gap-chasers.md), and the reopened evidence/archive tickets — make evidence, chasers and archive state agree.
5. [TKT-155](../backlog/TKT-155-dashboard-three-state-layout/TKT-155-dashboard-three-state-layout.md), [TKT-157](../backlog/TKT-157-handler-copy-audit/TKT-157-handler-copy-audit.md), and [TKT-163](../backlog/TKT-163-merge-dialog-layout/TKT-163-merge-dialog-layout.md) — complete the handler-facing workflow.
6. [TKT-154](../backlog/TKT-154-mcp-image-ingestion/TKT-154-mcp-image-ingestion.md) and [TKT-156](../backlog/TKT-156-chaser-file-request/TKT-156-chaser-file-request.md) — complete constrained inbound evidence channels.
7. [TKT-159](../backlog/TKT-159-feature-gate-intent-audit/TKT-159-feature-gate-intent-audit.md) and [TKT-164](../backlog/TKT-164-inbound-counts-500/TKT-164-inbound-counts-500.md) — reconcile the live platform and dashboard health.
8. [TKT-158](../backlog/TKT-158-case-remediation-rerun/TKT-158-case-remediation-rerun.md) — rerun affected cases only after prerequisite fixes are live.

Related existing tickets to reopen or verify as part of the programme: TKT-009, TKT-020, TKT-024, TKT-034, TKT-044, TKT-047, TKT-089, TKT-110, TKT-120, TKT-129, TKT-130, TKT-148, TKT-119, TKT-139 and TKT-140.

## Verification / close-out
- Every member ticket reaches `done` through an independent ticket-verifier verdict.
- Every implementation PR has both reciprocal reviewer evidence and a separate Codex review of the final head.
- Focused PRs are merged to `main`, required Azure components are deployed, and Chrome plus live service evidence proves the resulting behavior.
- The final remediation ledger accounts for every targeted case and records unresolved source-data absences separately from software defects.

## Deferred
- Data-protection policy, PII scrubbing, and Azure subscription commercial conversion are outside this programme by operator instruction.
