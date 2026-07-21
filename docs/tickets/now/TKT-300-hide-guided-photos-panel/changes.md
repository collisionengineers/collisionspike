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
