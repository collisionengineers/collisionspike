# Changes — TKT-300

## 2026-07-21 — ticket minted (PLAN-015 Slice C)

Ticket created from PLAN-015.

## 2026-07-21 — implementation (visible only after an SPA deploy)

- `apps/web/src/features/cases/case-detail-main.tsx` — removed the `GuidedPhotoRequestPanel`
  mount (+ its divider) from the chasers tab, the `guidedPhotoLink` pass-through to
  `ChaserPanel`, and the now-unused destructured props (`guidedPhotoLink`, `setGuidedPhotoLink`,
  `onGuidedPhotoLinkCancelled`, `isRemoved`) plus the component import (`noUnusedLocals` would
  fail the build otherwise). An in-place comment records the restore path.
- `ChaserPanel`'s `guidedPhotoLink` prop is optional and guarded, so the guided-photo chaser
  template simply never offers — no ChaserPanel change needed.
- The component, its tests, and the controller state/wiring are untouched — restoring the panel
  is a revert of this change plus the capture-gate flips.
- Recorded: this is a code hide, not a gate (no `/api/gates/capture` endpoint exists), and it is
  not live until the staff SPA is deployed (runbook Phase 5).
- Verification: `@cs/web` build clean; full web suite 557/557 green after the change.

## 2026-07-21 — deployed (PLAN-015 Phase 5)

The staff SPA was rebuilt from `main` and deployed to `cespk-spa-dev` (SWA CLI; root answered
200 post-deploy), shipping this ticket's panel removal together with PR #158's copy edits. The
three capture gates were flipped off on `cespk-api-dev` in the same phase (verified: the public
capture routes answer 404 `capture_missing`). Deploy notes: `staticwebapp.config.json` must be
copied into `dist` (the build does not carry it), and the SWA CLI must run scoped to `apps/web`
— from the repo root its config discovery recurses into `node_modules` and crashes. Full record:
TKT-302 `evidence/cutover-2026-07-21.md`.
