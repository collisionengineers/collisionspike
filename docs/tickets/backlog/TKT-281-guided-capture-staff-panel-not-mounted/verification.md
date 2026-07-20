# Verification — TKT-281: Mount the guided-capture staff panel into CaseDetail

## Verdict
NOT YET IMPLEMENTED (component exists; mount point does not)

## Evidence
`GuidedPhotoRequestPanel.tsx` and its API client calls are built and covered by
`GuidedPhotoRequestPanel.test.tsx`. `case-detail-main.tsx` does not render it and does not pass
`guidedPhotoLink` to `ChaserPanel`. Confirmed by a repo-wide grep for the component/prop names.

## Pending / gaps
- Mount `GuidedPhotoRequestPanel` into a real CaseDetail tab.
- Wire the created session's link through `guidedPhotoLink` to `ChaserPanel`.
- A live (or offline end-to-end) test proving a staff user can create a session from a real case view.

## How to re-verify
Mount the panel, add an integration test exercising CaseDetail → create session → chaser draft shows
the link, and confirm no gate is flipped by the mount itself.
