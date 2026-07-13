---
id: TKT-181
title: Show truthful photo-checking states
status: backlog
priority: P1
area: evidence
tickets-it-relates-to: [TKT-048, TKT-064, TKT-130, TKT-146, TKT-151, TKT-167, TKT-168, TKT-174]
research-link: docs/tickets/backlog/TKT-181-truthful-image-analysis-states/evidence/image-analysis-state-audit.md
plan: PLAN-004
---

# Show truthful photo-checking states

## Problem
Cases can appear to be missing photos when photos are present but have not been classified, cannot be opened or are stuck in processing. A checking state can also persist without a finite end or useful recovery action. This hides whether the handler needs to obtain photos, wait briefly, retry a failed check or inspect a problem file.

## Evidence
- [Operator evidence about stuck checking](./evidence/operator-source-stuck/) reports images remaining a permanent submission blocker. Its separate field-review concern remains owned by TKT-130 and is not folded into this ticket.
- [Operator evidence about image reasons](./evidence/operator-source-reasons/) says cases with present-but-problematic images must be distinguishable from cases that genuinely need more images.
- TKT-130 requires one canonical readiness decision; image presence and image usability must therefore have distinct, stable inputs.
- The state and timing inventory is to be recorded at [image-analysis-state-audit.md](./evidence/image-analysis-state-audit.md).

## Proposed change
PROPOSED (not built):
- Introduce one finite per-image checking lifecycle with recorded attempt, start, deadline, completion and problem reason.
- Derive one case-level state from those image records: no photos received, checking photos, photos ready, or photos need attention.
- Expire stale checking attempts into a recoverable attention state and let a handler retry only unresolved images.
- Use the canonical result for queue reasons, readiness and the evidence view so present-but-problematic images are never reported as absent.

## Acceptance
- **A1.** “No photos received” is used only when the case has zero eligible image files; a case with one or more present images is never counted or labelled as having no photos merely because checking is incomplete or unsuccessful.
- **A2.** Every present image has one canonical state from unclassified, queued, checking, ready, unusable or failed, with an attempt identifier, start time, deadline, completion time where applicable, and a stable plain-language reason for unresolved/unusable/failed outcomes. Preview/rendition loading is separate: a TKT-174 preview failure cannot change analysis or readiness unless the original content path independently proves the evidence unavailable.
- **A3.** The case-level display is derived deterministically: zero images shows “No photos received”; any unexpired queued/checking image shows “Checking photos…”; any expired, unusable, unclassified or failed image shows “Some photos need attention” with the affected count; all checks resolved shows “Photos ready” only when the required photo set is complete, otherwise it retains a specific “More photos needed” reason.
- **A4.** No image remains in queued or checking after its recorded deadline. A recovery check transitions stale work to failed/attention even after an app restart or scale-to-zero wake, and the signed-in UI stops showing an indefinite spinner.
- **A5.** A handler can retry unresolved images from the attention state. Retry is idempotent, creates at most one active attempt per image, does not reprocess ready images, and either completes or reaches another finite deadline.
- **A6.** The evidence view identifies each problem image and gives a useful action such as “Try again”, “Open photo” or “Replace photo”; it does not expose service names, status codes, internal state names or other engineering language.
- **A7.** Readiness, Not ready reasons and queue counts use the same case-level image state and distinguish at least four outcomes: no photos received, required photos still needed, checking in progress, and present photos needing attention. Only a complete, resolved required photo set can produce the ready outcome.
- **A8.** Late or duplicate completion messages cannot overwrite a newer attempt, change a handler decision, create duplicate evidence or move a case to ready incorrectly; every transition is append-only auditable.

## Validation
- Document the current per-image records, naturally occurring stalled cases and actual processing duration distribution before selecting the production deadline; the configured deadline must be finite and covered by tests.
- Add exhaustive state-machine tests for zero images, incomplete required sets, mixed states, expiry, restart recovery, retry, late completion, duplicate completion and concurrent attempts.
- Add integration tests proving the queue, readiness response and evidence view derive the same reason from the same stored records.
- Add rendered tests with controlled time for the finite progress, attention, action, count and plain-language error states.
- After deployment, verify signed in against operator-approved examples for no images, normal completion, a present unusable image and an expired/retried image; reconcile the UI with stored transitions and monitoring timestamps.

## Research
Distilled 2026-07-13 from the operator’s photo-loading and Not ready reviews. The production state inventory, duration evidence, chosen deadline and signed-in recovery proof belong in [evidence/image-analysis-state-audit.md](./evidence/image-analysis-state-audit.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator missing-image reasons](./evidence/operator-source-reasons/info.md)
- [Operator stuck-progress note](./evidence/operator-source-stuck/images-issue.md)
- [Planned research evidence](./evidence/image-analysis-state-audit.md)
