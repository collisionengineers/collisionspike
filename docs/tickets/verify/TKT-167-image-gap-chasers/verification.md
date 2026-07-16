# Verification — TKT-167: Keep image chasers available until every image rule passes

## Verdict
PENDING — implementation is tested offline; the reviewed merge, SPA deployment and designated live-case Chrome walkthrough are still required.

## Offline evidence
- Reviewed implementation base: `origin/main` at `eaa31fbe6c430602e9bffcb66aba4c09c76eafec`; implementation commit `de25c90e547daf6aa9d6135ba9cf158ed28b0ef1`.
- Domain full suite: `56` files / `1,152` tests passed; TypeScript build passed.
- SPA full suite: `46` files / `503` tests passed; production TypeScript/Vite build passed (existing large-chunk warning only).
- API full suite: `67` files / `682` tests passed; TypeScript build passed.
- Orchestration full suite: `31` files / `421` tests passed; TypeScript build passed.
- Focused chaser matrix: `3` files / `22` tests passed in `ChaserPanel.test.ts`, `ChaserPanel-copy.test.tsx` and `case-detail-chaser-contract.test.ts`.
- `git diff --check`, ticket checks, documentation-link checks and shared-skill sync checks passed.

## Acceptance coverage
- `packages/domain/src/contracts/image-rules.test.ts` proves zero accepted/all-excluded, missing overview with visible registration, missing close-up, unresolved review and reflection-only behavior from one structured evaluator.
- `apps/web/src/shared/ui/ChaserPanel.test.ts` proves exact templates for no images, all excluded, wrong role, invisible registration, missing close-up, unresolved image decision, fully valid, instruction/no-instruction and existing overview-draft/channel combinations.
- `apps/web/src/shared/ui/ChaserPanel-copy.test.tsx` proves the active upload link is copied with the editable draft, link failure copies/logs nothing, and rerenders after concurrent review, exclusion, upload, role classification and case replacement remove or reopen only the applicable gap.
- `apps/web/src/features/cases/case-detail-chaser-contract.test.ts` pins the composer to `liveCase`, the same current image working copy used by readiness.

## Pending / live gaps
- The final PR must pass its normal repository and CI checks; no reciprocal AI-review marker is required.
- The reviewed SPA build must be deployed, then a designated test case must walk representative gaps through upload/classification and show each option disappearing only after its own gap resolves.
- TKT-156's Box File Request template is still an external dependency for the real upload-link walkthrough. It requires an authenticated Box session and all writes must stay inside test root `392761581105`; outside that root remains read-only.
- No live case, Outlook message or Box object was mutated during offline verification.

## How to re-verify
1. Merge only the exact mutually reviewed head and deploy the SPA production build from merged `main`.
2. In a designated test-root case, capture the Chasers tab for: no accepted images, all excluded, missing registration-visible overview, missing close-up, unresolved review and a fully valid set.
3. Save one classification/include/exclude change and upload one replacement through the active File Request. Without refreshing, confirm only the resolved option disappears and the other gaps remain.
4. Confirm an instruction request appears independently when the instruction is absent, and an accepted reflection-only image on an Image Based Assessment case creates no false image gap.
5. Read the resulting case/evidence/chaser state and telemetry; confirm no write occurred outside Box test root `392761581105` and no Outlook mutation occurred.

## Independent verification update — 2026-07-14

### Verdict

PENDING

### Evidence per acceptance

- Acceptance 1 — `ChaserPanel` derives templates from `evaluateEvaImageReadiness`, the same evaluator
  consumed by canonical case status (`ChaserPanel.tsx:111-130`; `case-status.ts:270-290`). PR 81
  merge `ba78ea3d` is an ancestor of current source.
- Acceptance 2 — accepted-image filtering requires image kind, staff acceptance and non-exclusion
  (`image-rules.ts:70-80`). Zero-accepted/all-excluded tests retain count, overview and close-up gaps
  (`image-rules.test.ts:89-102`; `ChaserPanel.test.ts:104-122`).
- Acceptance 3 — structured gaps cover usable count, registration-visible overview, damage close-up
  and unresolved review (`image-rules.ts:103-170`), mapping to specific chaser wording
  (`ChaserPanel.tsx:61-99`).
- Acceptance 4 — reflection alone is excluded from this gap evaluator and regression-tested on an
  Image Based Assessment case (`image-rules.ts:143-169`; `ChaserPanel.test.ts:153-168`).
- Acceptance 5 — image drafts disappear only when the canonical gap list is empty; missing-instruction
  eligibility is independent (`ChaserPanel.tsx:113-131`). Tests cover valid and instruction states.
- Acceptance 6 — every draft is gap-specific/editable (`ChaserPanel.tsx:61-99,352-368`). Image drafts
  require an active case-scoped File Request before copying/logging (`:227-298,370-390`).
- Acceptance 7 — `CaseDetail` passes the current server-confirmed image working copy into readiness
  and `ChaserPanel` (`CaseDetail.tsx:1063-1086,2796-2799`). Effects preserve handler edits while a gap
  remains and move immediately when it resolves or case identity changes (`ChaserPanel.tsx:184-209`).
  Component tests cover review, exclusion, upload, classification and case replacement
  (`ChaserPanel-copy.test.tsx:124-200`). Delete/inspection transitions were not exercised live.
- Acceptance 8 — committed coverage includes no images, all excluded, wrong role, invisible
  registration, missing close-up, unresolved review, reflection-only, valid set, concurrent
  classification and instruction independence. Recorded suites are Domain 1,152, SPA 503, API 682
  and orchestration 421. Independent reruns were unavailable without local Vitest.
- Acceptance 9 — deployed SPA contains every TKT-167 gap code/template and distinctive draft. A
  signed-in production case, WG63ZTO/QDOS26085, loaded and showed live canonical gaps “no overview
  with a visible registration; no main-damage close-up.” No gap was then resolved through
  upload/classification, so disappearance timing remains unproved.

### Pending / gaps

- No designated live walkthrough covered each representative gap and successful resolution.
- No live proof shows only the resolved option disappearing without refresh.
- Active File Request copying/logging was not exercised.
- Reflection-only and independent-instruction behavior were not walked live.
- Delete, inspection-decision and merge-driven recomputation remain source/test evidence only.
- Later SPA deployment is fingerprinted but absent from the deployment registry.

### How to re-verify

1. Record deployed SPA candidate/hash in the deployment registry.
2. Use authorized test cases for zero accepted, all excluded, missing overview/registration, missing
   close-up, unresolved review and fully valid states.
3. Resolve each gap through classification/include-exclude/upload without refreshing and capture
   Chasers before/after.
4. Verify instruction independence and the Image Based Assessment reflection exception.
5. Exercise File Request only within Archive test root `392761581105`; confirm no Outlook or
   production-folder mutation.

### Confidence + unread surfaces

HIGH confidence that merged TKT-167 is in the deployed SPA; HIGH confidence the required live
transition proof is incomplete. Unread surfaces are Chasers-tab transitions, upload/classification
responses, active File Request lifecycle, telemetry and Archive state.
