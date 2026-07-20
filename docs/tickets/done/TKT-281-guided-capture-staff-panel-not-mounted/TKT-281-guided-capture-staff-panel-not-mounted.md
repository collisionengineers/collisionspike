---
id: TKT-281
title: Guided capture — mount the staff request panel into CaseDetail (currently dead code)
status: done
priority: P2
area: web
tickets-it-relates-to: [TKT-278, TKT-200]
research-link: docs/tickets/done/TKT-281-guided-capture-staff-panel-not-mounted/evidence/scope.md
---

# Guided capture — mount the staff request panel into CaseDetail (currently dead code)

## Problem (as found; now closed — see Resolution)

Renumbered from collisioncapture's `CCAP-012-staff-capture-ui-chaser` during the TKT-278 repository
merge — verification at the time found this was **not** a duplicate of already-shipped work. The staff
UI was fully built and unit-tested (`apps/web/src/shared/ui/GuidedPhotoRequestPanel.tsx`: shot-plan/expiry
dropdowns, session list with status badges, replace/cancel actions; `rest-client.ts`'s
`createCaptureSession`/`listCaptureSessions`/`rotateCaptureSession`/`revokeCaptureSession`;
`ChaserPanel.tsx`'s `guidedPhotoLink` prop and message-builder logic) — but **`GuidedPhotoRequestPanel`
was never rendered anywhere in the live app**. `case-detail-main.tsx` rendered `<ChaserPanel>` without a
`guidedPhotoLink` prop, and no `evidence`/other tab wired the panel in either.

## Resolution

Closed as **duplicate/absorbed into TKT-200**: while this ticket sat in `backlog`, a parallel TKT-159
gate-audit follow-up (same underlying root cause — the `mockup-app` → `apps/web` reconciliation merge
`bbe20b3e` dropping screen-level wiring) found and fixed this exact gap directly under TKT-200. See
`docs/tickets/now/TKT-200-guided-capture-sessions/changes.md`'s 2026-07-20 "staff SPA panel wiring gap
found and fixed" entry: `GuidedPhotoRequestPanel` is now mounted in `case-detail-main.tsx`'s Chasers tab
and its result threads into `ChaserPanel`'s `guidedPhotoLink` prop — the exact fix this ticket proposed.
Confirmed directly on this branch: `apps/web/src/features/cases/case-detail-main.tsx` renders
`<GuidedPhotoRequestPanel>` and passes `guidedPhotoLink={guidedPhotoLink}` to `<ChaserPanel>`.
No further code change needed here. The one acceptance line below this ticket never reached (live/offline
end-to-end proof of session creation from a real case) is TKT-200's own outstanding live-proof
requirement, not a separate obligation — track it there, not here.

## Evidence

- [Scope](./evidence/scope.md) — exact files confirmed built vs. the one missing mount point.

## Proposed change

Mount `GuidedPhotoRequestPanel` into `case-detail-main.tsx`'s evidence or chasers flow, and wire the
`guidedPhotoLink` prop through to `ChaserPanel` so a created session's link is available to the existing
chaser-draft integration. No new component logic — the panel and its plumbing are already built and
tested; this is a wiring gap, not an implementation gap.

## Acceptance

- A staff user can create/list/rotate/revoke a guided-capture session from a real case in the live app
  (not just from `GuidedPhotoRequestPanel.test.tsx` in isolation).
- The created session's link flows into the chaser draft via the existing `guidedPhotoLink` prop and
  `guidedPhotoRequestBody()` builder, without duplicating or accumulating stale link blocks.
- This remains gated behind the same default-off `CAPTURE_SESSIONS_ENABLED`-family gates TKT-200 already
  established — mounting the UI does not itself flip any gate.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)
