# Changes — TKT-309

## Source

### `packages/domain/src/contracts/case-status.ts`

- `ReadinessCheck` gained an optional `advisory?: boolean` field.
- The `images` check in `evaluateCaseReadiness` now sets `advisory: true`.
- `ready` is now `checks.filter((check) => !check.advisory).every((check) => check.ok)` (was
  `checks.every(...)` over the full array).
- `statusForReviewCase`'s `fieldContractValid && !baseImagesValid -> 'missing_images'` branch
  removed (now unreachable — see evidence). `missing_images` remains in the `CaseStatus` union
  and code table for the unrelated `archiveHoldingPending` early-return and historical rows.
- Updated the decision-tree comment above `statusForReviewCase` and the docstring above
  `evaluateCaseReadiness` to record the change; renumbered the remaining steps.

### `packages/domain/src/contracts/image-rules.ts`

- Extended the existing TKT-130 note with a dated "SUPERSEDED (P1-E...)" paragraph rather than
  leaving it contradicted. `evaluateEvaImageRules` itself is unchanged.

### `docs/tickets/now/TKT-130-review-queue-readiness/TKT-130-review-queue-readiness.md`

- Added a dated note recording the supersession and pointing to this ticket, so the two tickets
  don't silently disagree.

## Tests

- `canonical-readiness.test.ts` — three cases updated from asserting `missing_images`/`not-ready`
  to `ready_for_eva`/`review` (with `imagesReady: false` and the checklist detail still asserted,
  proving the gap stays visible).
- `case-status.test.ts` — three cases updated the same way; renamed the describe block from
  "missing_images branch" to "images are advisory (P1-E)".
- `services/data-api/src/features/cases/edit-save.test.ts` — one fixture updated from the
  `missing_images` status code (100000004) to `ready_for_eva` (100000007).

Results: `@cs/domain` 607 passed (32 files); `@cs/api` 1113 passed (111 files); `@cs/web` 557
passed (56 files); `@cs/orchestration` 649 passed (59 files, unaffected by this change but run
for the full-suite pass). `@cs/domain` and `@cs/api` typecheck clean (`tsc -b --force`).

## Not done here

Live recomputation of existing cases against the new contract — this ticket is the domain-level
behaviour change; a backup-first live recompute (if warranted) is a separate operational step,
consistent with how TKT-130's own prior rulings were rolled out.
