# Verification — TKT-290: Centralize the intake orchestrator's duplicated VRM/ref precedence logic

## Verdict
TESTED-OFFLINE

## Evidence

- `services/orchestration`: `npx vitest run` — **54 test files, 603 tests, all green**, including
  the new `case-identity.test.ts` (11 tests) and the full pre-existing `intake-*.test.ts` /
  `caseResolve-replay.test.ts` suite unchanged (proves zero behavior change at every swapped call
  site, not just the new helper's own logic).
- `services/orchestration`: `npx tsc --noEmit -p .` — clean, no errors, after building
  `@cs/domain`/`@cs/server-runtime` (a fresh-worktree project-reference prerequisite, unrelated to
  this change).
- Manual read-through of both edited files confirms the two deliberate exceptions
  (`caseResolve.ts:138`'s candidate-first ref, TKT-102's `triedVrm`) were left untouched, each with an
  explanatory comment.

## Pending / gaps

None for this slice's own scope. Slice 4b (the parse-fed reorder, PLAN-014) is what will actually
make `parserVrm`/`parserRef` available at the currently-pre-parse call sites (`attach_case`,
`route_images_unmatched`, reply-link, the dedup ladder) — this ticket only proves the centralization
itself is behavior-preserving today; Slice 4b's own work will add a test asserting the centralized
helper correctly prefers the newly-available parser value once it exists, per the review-gate
sequencing in PLAN-014's Part 3.

## How to re-verify

- `cd services/orchestration && npx vitest run` — expect 54 files / 603+ tests green.
- `cd services/orchestration && npx tsc --noEmit -p .` — expect clean (build `@cs/domain` and
  `@cs/server-runtime` first if this is a fresh checkout: `npm run build --workspace=@cs/domain
  --workspace=@cs/server-runtime` from the repo root).
