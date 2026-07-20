---
id: PLAN-003
title: Operator review and fix-up wave
status: active
tickets: [TKT-010, TKT-024, TKT-070, TKT-099, TKT-116, TKT-117, TKT-118, TKT-119, TKT-120, TKT-121, TKT-122, TKT-123, TKT-124, TKT-125, TKT-126, TKT-127, TKT-128, TKT-129, TKT-130, TKT-131, TKT-132, TKT-133, TKT-134, TKT-135, TKT-136, TKT-137, TKT-138, TKT-139, TKT-140, TKT-141, TKT-142, TKT-143, TKT-144, TKT-145, TKT-146, TKT-147, TKT-148]
depends-on: []
plan-kind: remediation
---

# PLAN-003 — Operator review and fix-up wave

## Outcome

Resolve the grouped staff review findings across queues, intake identity, previews, evidence, export and
readiness while preserving the behavior already verified by earlier members.

## Decisions

- Manual reviews remain the requirement source for each affected surface.
- A member may close only against its own acceptance evidence; plan membership does not imply a verdict.
- Follow-up findings reopen the owning ticket rather than creating parallel implementations.
- Shared readiness and evidence rules are changed once at their canonical source and exercised by every
  affected screen and workflow.

## Sequence

1. Maintain completed queue and presentation fixes.
2. Finish open case, evidence and readiness corrections.
3. Obtain live proof for members in `verify`.
4. Resolve blocked provider-input work when the required samples become available.

## Close-out

Close after every member is `done` or explicitly transferred with its unresolved acceptance lines named.

<!-- GENERATED:PROGRESS -->
## Computed progress

**28/37 done (75%).**

| Status | Count |
|---|---:|
| Now | 1 |
| Verify | 7 |
| Done | 28 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 1 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-010](../done/TKT-010-delete-case/TKT-010-delete-case.md) | done | Close case (renamed from delete/remove) — confirm + audit, available to all users |
| [TKT-024](../verify/TKT-024-image-based-new-case/TKT-024-image-based-new-case.md) | verify | Image-only new-case form (drop instruction-only fields) |
| [TKT-070](../done/TKT-070-email-body-readability/TKT-070-email-body-readability.md) | done | Inbox email previews are one unreadable line — keep line breaks, cut noise |
| [TKT-099](../done/TKT-099-qcl-case-po-generation/TKT-099-qcl-case-po-generation.md) | done | QCL cases not generating Case/PO correctly |
| [TKT-116](../done/TKT-116-queues-pagination/TKT-116-queues-pagination.md) | done | Paginate the case queues at 15 per page (same as the inbox) |
| [TKT-117](../done/TKT-117-queues-last-update/TKT-117-queues-last-update.md) | done | Show a "Last update" line for each case in the queues view |
| [TKT-118](../done/TKT-118-image-only-vrm-identity/TKT-118-image-only-vrm-identity.md) | done | Rename the "Image Based" case label + identify image-only cases by VRM (no Case/PO before instructions) |
| [TKT-119](../done/TKT-119-retro-locate-ack-hardening/TKT-119-retro-locate-ack-hardening.md) | done | Retro case-locate failed on ref PHA5007 — acks must never mint, add an "Unable to Locate" outcome, explore Graph deleted-items |
| [TKT-120](../done/TKT-120-fairway-payment-misclass/TKT-120-fairway-payment-misclass.md) | done | FAIRWAY LEGAL payment transfer marked Unidentified — should classify as payments/billing |
| [TKT-121](../done/TKT-121-email-type-dropdown-overflow/TKT-121-email-type-dropdown-overflow.md) | done | The "E-mail Type" dropdown fills the whole page — cap its height with a scrollbar |
| [TKT-122](../done/TKT-122-dashboard-panel-alignment/TKT-122-dashboard-panel-alignment.md) | done | Align the dashboard containers — inbox and "Check the flagged details" do not line up |
| [TKT-123](../done/TKT-123-exclude-label-reflection-warning/TKT-123-exclude-label-reflection-warning.md) | done | Rename "exclude (person reflection)" to "Exclude" + dismissible vision reflection warning on images |
| [TKT-124](../done/TKT-124-photo-orderer-images-only/TKT-124-photo-orderer-images-only.md) | done | Photo orderer shows .eml files — it must list images only |
| [TKT-125](../done/TKT-125-add-case-descriptor-removal/TKT-125-add-case-descriptor-removal.md) | done | Remove the field descriptors under the Add Case inputs (and the wrong "4-char" principal claim) |
| [TKT-126](../done/TKT-126-eva-export-zip/TKT-126-eva-export-zip.md) | done | Export for EVA downloads a .zip of the JSON plus all the images |
| [TKT-127](../done/TKT-127-ai-suggestions-generate-204/TKT-127-ai-suggestions-generate-204.md) | done | AI Assistant "Generate Suggestions" does not generate — devtools shows 204 no content |
| [TKT-128](../done/TKT-128-imported-details-blank/TKT-128-imported-details-blank.md) | done | Imported details — from the instruction document or email" renders blank |
| [TKT-129](../verify/TKT-129-image-based-inspection-done/TKT-129-image-based-inspection-done.md) | verify | Simplify the inspection address or Image Based Assessment choice |
| [TKT-130](../now/TKT-130-review-queue-readiness/TKT-130-review-queue-readiness.md) | now | Review contains only cases that are ready for EVA |
| [TKT-131](../done/TKT-131-image-role-classify-retry/TKT-131-image-role-classify-retry.md) | done | Classify the role-unknown evidence images — retry the backfill residue so cases can reach Ready for EVA |
| [TKT-132](../done/TKT-132-generate-suggestions-inputs/TKT-132-generate-suggestions-inputs.md) | done | Widen the AI-suggestion generate inputs beyond accident circumstances |
| [TKT-133](../verify/TKT-133-evidence-dedup-box-kind/TKT-133-evidence-dedup-box-kind.md) | verify | Deduplicate evidence rows (email + Box mirror twins) + fix the box-webhook kind at source |
| [TKT-134](../done/TKT-134-action-logs-humanize/TKT-134-action-logs-humanize.md) | done | Action-logs page renders raw engineering strings — humanize the staff-visible log lines |
| [TKT-135](../blocked/TKT-135-circumstances-provider-samples/TKT-135-circumstances-provider-samples.md) | blocked | Circumstances coverage residual — needs one dropped sample per 0%-coverage provider layout |
| [TKT-136](../done/TKT-136-parse-fallback-ref-guard/TKT-136-parse-fallback-ref-guard.md) | done | Guard the /parse fallback reference against money values and text fragments (RIGERANT R1234YF) |
| [TKT-137](../verify/TKT-137-uncased-ai-suggestion-surface/TKT-137-uncased-ai-suggestion-surface.md) | verify | Surface triage_category AI suggestions on uncased emails — currently written but invisible |
| [TKT-138](../done/TKT-138-token-roles-claim-rename/TKT-138-token-roles-claim-rename.md) | done | Live staff tokens still carry the pre-rename "CollisionSpike.Admin" roles value — reconcile with the Superuser rename |
| [TKT-139](../done/TKT-139-retro-search-tokenization/TKT-139-retro-search-tokenization.md) | done | Retro Outlook $search misses spaced-ref variants (Graph tokenization: PHA5007 vs PHA 5007) |
| [TKT-140](../done/TKT-140-retro-backlog-drain/TKT-140-retro-backlog-drain.md) | done | Bulk retro backlog drain — reconstitute prior un-cased emails from Deleted Items |
| [TKT-141](../done/TKT-141-merged-twins-exclusion/TKT-141-merged-twins-exclusion.md) | done | Exclude merged/retired duplicate cases from twin counts and attention lists |
| [TKT-142](../done/TKT-142-boxfn-large-payload/TKT-142-boxfn-large-payload.md) | done | Box facade 502s on large base64 payloads — QDOS26029 archive stranded (17.6 MB .eml) |
| [TKT-143](../done/TKT-143-extraction-stems-identity/TKT-143-extraction-stems-identity.md) | done | Pass the resolved provider/VRM into /extract-images so extraction filenames carry real identity |
| [TKT-144](../verify/TKT-144-blob-sha256-backfill-dedup/TKT-144-blob-sha256-backfill-dedup.md) | verify | Resolve the 214 blob-lane same-name duplicate evidence rows via a sha256 backfill |
| [TKT-145](../verify/TKT-145-caselink-evidence-backfill/TKT-145-caselink-evidence-backfill.md) | verify | Accepted case_link on a previously-uncased email must backfill its evidence to the case |
| [TKT-146](../verify/TKT-146-box-upload-event-classify/TKT-146-box-upload-event-classify.md) | verify | Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path) |
| [TKT-147](../done/TKT-147-tractable-make-vin/TKT-147-tractable-make-vin.md) | done | Tractable layout: capture vehicle make (two-label rule) + a VIN field slot |
| [TKT-148](../done/TKT-148-overview-photo-chaser/TKT-148-overview-photo-chaser.md) | done | Targeted overview-photo chaser for cases whose photo sets genuinely lack a vehicle overview |
<!-- /GENERATED:PROGRESS -->
