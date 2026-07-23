---
id: TKT-309
title: Make the EVA image rules advisory — they no longer gate readiness or submission
status: now
priority: P1
area: domain
tickets-it-relates-to: [TKT-130]
research-link: docs/tickets/now/TKT-309-eva-image-rules-advisory/evidence/code-read-2026-07-21.md
---

# Make the EVA image rules advisory — they no longer gate readiness or submission

## Problem

`evaluateEvaImageRules` (`packages/domain/src/contracts/image-rules.ts`) drove three
consequences through `evaluateCaseReadiness` (`case-status.ts`):

- persisted status `missing_images` (`statusForReviewCase`);
- `readinessForCase`'s `ready` boolean (`case-readiness.ts`);
- `canSubmitCaseToEva` (consumed at `case-support.ts`).

Operator decision, 2026-07-21 (same day as, and superseding, the TKT-130 note in
`image-rules.ts` that reaffirmed these three rules as "the whole contract" after an earlier
fourth gate — auto-exclude review — was already de-coupled): the three rules themselves
become advisory too. A case can now reach `ready_for_eva` and be submitted to EVA with zero
accepted images, or missing an overview/damage-closeup — the gap is shown on the Case Detail
checklist, it no longer withholds readiness.

## Change

- `ReadinessCheck` gained an `advisory?: boolean` field. The `images` check in
  `evaluateCaseReadiness` now sets `advisory: true`.
- `ready` is now computed over non-advisory checks only:
  `checks.filter((c) => !c.advisory).every((c) => c.ok)`. `imagesReady` is still returned and
  still populates the checklist detail text — only what `ready` derives from changed.
- `statusForReviewCase`'s `fieldContractValid && !baseImagesValid -> 'missing_images'` branch
  is removed: it is now unreachable, since a field-complete case's `readiness.ready` is `true`
  regardless of the image contract. `missing_images` remains in the `CaseStatus` union and
  code table (for the unrelated `archiveHoldingPending` early-return and for historical
  persisted rows) — no schema/enum change.
- `evaluateEvaImageRules` itself is unchanged; only how its caller weighs the result changed.
- Updated the TKT-130 note in `image-rules.ts` to record the supersession rather than leaving
  it contradicted.

## Acceptance

- A case with zero accepted images, or missing overview/damage-closeup, that otherwise meets
  every EVA field/address/vehicle/source requirement reaches `ready_for_eva`, is queued to
  Review, and `canSubmitCaseToEva` returns `true`.
- The Case Detail checklist still shows the `images` check with its failure detail
  (`imagesReady: false`) when the image contract isn't met — visible, not hidden.
- `missing_images` remains a valid `CaseStatus`/code-table value; `code-table-parity.mjs`
  passes unchanged.
- Regression coverage updated in `canonical-readiness.test.ts` and `case-status.test.ts`
  (previously pinned the opposite, blocking behaviour) plus a data-api fixture
  (`edit-save.test.ts`) that asserted the old `missing_images` code.

## Out of scope

- `evaluateEvaImageRules` / `image-rules.ts`'s own three-rule computation — unchanged.
- The auto-exclude review fourth gate already de-coupled by TKT-130 — unaffected, already
  advisory.

## Artifacts

- [Changes made](./changes.md)
- [Code-read evidence](./evidence/code-read-2026-07-21.md)
