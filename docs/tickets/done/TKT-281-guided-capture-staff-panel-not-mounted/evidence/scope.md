# Scope — TKT-281 (formerly CCAP-012)

Verified live in `apps/web/src`:
- `shared/ui/GuidedPhotoRequestPanel.tsx` — built, matches CCAP-012's proposed component closely
  (shot-plan dropdown `essential-v1`/`standard-exterior-v1`, expiry dropdown 24/72/168h, session list
  with status badges, replace/cancel actions).
- `data/rest-client.ts` — `createCaptureSession`/`listCaptureSessions`/`rotateCaptureSession`/
  `revokeCaptureSession` all present, matching the panel's needs.
- `shared/ui/ChaserPanel.tsx` — has a `guidedPhotoLink` prop and `guidedPhotoRequestBody()` message
  builder that adds-or-replaces the one upload-link block in the editable chaser draft (never
  accumulates stale links) — exactly CCAP-012's requirement.
- **Gap**: `grep` for `GuidedPhotoRequestPanel`/`GuidedPhotoLink` across all of `apps/web/src` hits only
  4 files, all in `shared/ui/`, plus the panel's own test file. `case-detail-main.tsx`'s
  `tab === 'chasers'` renders `<ChaserPanel>` **without** a `guidedPhotoLink` prop. No `evidence` (or
  other) tab renders `<GuidedPhotoRequestPanel>` either. The component is fully built, tested in
  isolation, and unreachable from the live app.
