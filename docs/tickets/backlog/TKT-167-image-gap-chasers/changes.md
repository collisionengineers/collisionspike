# Changes — TKT-167: Keep image chasers available until every image rule passes

## Status
Implemented and tested offline on `codex/tkt-167-image-gap-chasers`; reciprocal review, merge, deployment and live Chrome proof remain pending.

## Commits
- `de25c90e547daf6aa9d6135ba9cf158ed28b0ef1` — derive editable image chasers from the same structured gaps used by canonical readiness and recompute them from the case's live evidence working copy.

## Files changed
- `packages/domain/src/contracts/image-rules.ts`, `packages/domain/src/contracts/case-status.ts` — expose one complete image-readiness result (accepted count, role gaps and unresolved image decisions) and make case status consume it.
- `mockup-app/src/components/ChaserPanel.tsx` — replace raw-image/case-type gating with one editable template per unresolved canonical gap; keep the active File Request requirement for every image request.
- `mockup-app/src/screens/CaseDetail.tsx` — feed the composer the current server-confirmed image working copy used by readiness, so saved classifications and include/exclude changes apply immediately.
- `packages/domain/src/contracts/image-rules.test.ts`, `mockup-app/src/components/ChaserPanel.test.ts`, `mockup-app/src/components/ChaserPanel-copy.test.tsx`, `mockup-app/src/screens/case-detail-chaser-contract.test.ts` — regression coverage for all image-gap branches, independent instruction chasing, link enforcement and live recomputation.

## Summary
- The presence of a raw image can no longer hide image chasers. Zero accepted images, all-excluded sets, missing overview/visible registration, missing damage close-up and unresolved automatic decisions each retain an appropriate draft.
- A fully valid accepted set is the only image-completeness state that suppresses all image drafts. Missing-instruction eligibility remains independent.
- Each image draft names only its unresolved gap and remains editable. Copying or logging it still fails closed until TKT-156 supplies an active case-scoped upload link.
- Evidence changes replace only a draft whose gap has actually resolved; handler edits to a still-applicable draft are preserved. A changed case identity resets the draft to the new case.
- A reflection observation is not treated as an image gap by itself, preserving the TKT-161 exception while explicit exclusions and other defects continue to affect readiness.
- No Outlook or Box mutation was performed.
