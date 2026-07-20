# Verification — TKT-281: Mount the guided-capture staff panel into CaseDetail

## Verdict
CLOSED — duplicate/absorbed into TKT-200 (the gap this ticket identified has since been fixed there)

## Evidence
At authoring time, `GuidedPhotoRequestPanel.tsx` and its API client calls were built and covered by
`GuidedPhotoRequestPanel.test.tsx`, but `case-detail-main.tsx` did not render it and did not pass
`guidedPhotoLink` to `ChaserPanel` — confirmed by a repo-wide grep for the component/prop names.

That gap is now closed: `apps/web/src/features/cases/case-detail-main.tsx` renders
`<GuidedPhotoRequestPanel caseId={c.id} disabled={isRemoved} onLinkReady={setGuidedPhotoLink}
onLinkCancelled={onGuidedPhotoLinkCancelled} />` in the Chasers tab and passes
`guidedPhotoLink={guidedPhotoLink}` to `<ChaserPanel>` — landed under TKT-200 via PR #143
(commit `dd182697`, merged as `ae6c0fad`). Confirmed directly on this branch post-merge with main.

## Pending / gaps
None owned by this ticket. The one acceptance line this ticket never reached — live (or offline
end-to-end) proof that a staff user can create a session from a real case view — is TKT-200's own
outstanding live-proof requirement (its verdict stays `PENDING`); do not duplicate that tracking here.

## How to re-verify
Not applicable to this ticket going forward — re-verify under TKT-200
(`docs/tickets/now/TKT-200-guided-capture-sessions/verification.md`).
