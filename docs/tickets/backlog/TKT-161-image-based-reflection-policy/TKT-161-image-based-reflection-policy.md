---
id: TKT-161
title: Allow reflection images for Image Based Assessment cases
status: backlog
priority: P1
area: evidence
tickets-it-relates-to: [TKT-123, TKT-129, TKT-146, TKT-148]
research-link: docs/tickets/backlog/TKT-161-image-based-reflection-policy/evidence/operator-note.md
plan: PLAN-004
---

# Allow reflection images for Image Based Assessment cases

## Problem
The current image-quality rule automatically excludes an image when a person is reflected in it. That rule is wrong when the case is recorded as Image Based Assessment: the reflection should remain visible as an observation, but it must not by itself exclude the image, block readiness or disable an appropriate chaser.

## Evidence
- [Operator note](./evidence/operator-note.md) — raw drop-note after distillation.
- [Source note](./evidence/source-evidence/image-based-reflections.txt) — preserved input from the distillation inbox.
- TKT-123 introduced the current automatic reflection exclusion and therefore owns the superseded behavior.
- TKT-129 owns the persisted inspection decision used to apply this exception.

## Proposed change
PROPOSED (not built): make reflection handling depend on the persisted inspection decision and distinguish a reflection observation from a staff or rule-owned exclusion.

## Acceptance
- The exception is based on the case's persisted inspection decision, whether it came from a provider default or a staff choice; filename/provider guessing is not used.
- On an Image Based Assessment case, a reflection observation remains visible but does not by itself set the image to excluded, make it unusable, block Review, or disable an otherwise valid chaser.
- Other defects and explicit staff exclusions continue to work unchanged; the exception is narrow to the reflection-only rule.
- Existing Image Based Assessment cases whose images were excluded only by the reflection rule are reconciled idempotently. Staff exclusions and exclusions owned by another defect are preserved.
- Changing a case from an address to Image Based Assessment removes only reflection-owned restrictions; changing it back reapplies current reflection rules without overwriting staff decisions.
- Repeated classification, reconciliation and archive events do not duplicate observations, warnings, evidence rows or audit entries.
- Readiness and chaser availability are recomputed after a relevant inspection-decision or image-classification change.
- UI copy uses handler language and does not disclose or reproduce private policy rationale.
- Tests cover reflection-only, reflection plus another defect, staff exclusion, both inspection decisions, provider-prefilled Image Based Assessment, decision transitions, reconciliation and retry.
- Live proof uses a designated test case and records the image decision, accepted-image count, queue state, chaser availability and audit before and after the exception.

## Research
Distilled 2026-07-12 from the supplied operator note, now preserved in this ticket's evidence folder.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Source note](./evidence/source-evidence/image-based-reflections.txt)
