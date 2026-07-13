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
- `mockup-app/src/components/ChaserPanel.test.ts` proves exact templates for no images, all excluded, wrong role, invisible registration, missing close-up, unresolved image decision, fully valid, instruction/no-instruction and existing overview-draft/channel combinations.
- `mockup-app/src/components/ChaserPanel-copy.test.tsx` proves the active upload link is copied with the editable draft, link failure copies/logs nothing, and rerenders after concurrent review, exclusion, upload, role classification and case replacement remove or reopen only the applicable gap.
- `mockup-app/src/screens/case-detail-chaser-contract.test.ts` pins the composer to `liveCase`, the same current image working copy used by readiness.

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
