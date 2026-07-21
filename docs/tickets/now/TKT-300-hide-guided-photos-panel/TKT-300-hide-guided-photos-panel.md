---
id: TKT-300
title: Hide the guided-photos staff panel from the case page (PLAN-015 Slice C)
status: now
priority: P1
area: ui
tickets-it-relates-to: [TKT-200, TKT-283]
research-link: docs/tickets/plans/PLAN-015-app-alpha-testing.md
plan: PLAN-015
---

# Hide the guided-photos staff panel (PLAN-015 Slice C)

## Problem

For the alpha, guided capture is switched off at the API (the three capture gates go off on
`cespk-api-dev`, which also closes TKT-200's standing unprotected-ingress exposure). The staff-side
"Request guided photos" panel is not client-gated — there is no `/api/gates/capture` endpoint — so
with the API off it would still render and fail with an error toast on use. The panel must not be
visible while capture is off.

## Changes

- `apps/web/src/features/cases/case-detail-main.tsx` — remove the `GuidedPhotoRequestPanel` mount
  (and its divider) from the chasers tab and the `guidedPhotoLink` pass-through to `ChaserPanel`
  (whose prop is optional and guarded — the guided-photo chaser template simply never offers).
- Remove now-unused imports/state only. The component, its tests, and the controller wiring stay in
  place so restoring the panel is a focused revert of this change.

This is a code hide, not a gate: record that a future re-enable is "revert this ticket's SPA
change + flip the capture gates", and that the change is not live until the staff SPA is deployed.

## Acceptance criteria

- The chasers tab renders no guided-photos panel and no guided-photo chaser option.
- No unused-variable/import build errors (`@cs/web` builds clean; `noUnusedLocals`).
- Existing `GuidedPhotoRequestPanel` component tests still pass (component untouched).
- Web test suite green.

## Artifacts

- [Changes made](./changes.md)
