---
id: TKT-281
title: Guided capture — mount the staff request panel into CaseDetail (currently dead code)
status: backlog
priority: P2
area: web
tickets-it-relates-to: [TKT-278, TKT-200]
research-link: docs/tickets/backlog/TKT-281-guided-capture-staff-panel-not-mounted/evidence/scope.md
---

# Guided capture — mount the staff request panel into CaseDetail (currently dead code)

## Problem

Renumbered from collisioncapture's `CCAP-012-staff-capture-ui-chaser` during the TKT-278 repository
merge — but verification found this is **not** a duplicate of already-shipped work. The staff UI is
fully built and unit-tested (`apps/web/src/shared/ui/GuidedPhotoRequestPanel.tsx`: shot-plan/expiry
dropdowns, session list with status badges, replace/cancel actions; `rest-client.ts`'s
`createCaptureSession`/`listCaptureSessions`/`rotateCaptureSession`/`revokeCaptureSession`;
`ChaserPanel.tsx`'s `guidedPhotoLink` prop and message-builder logic) — but **`GuidedPhotoRequestPanel`
is never rendered anywhere in the live app**. `case-detail-main.tsx` renders `<ChaserPanel>` without a
`guidedPhotoLink` prop, and no `evidence`/other tab wires the panel in either. A staff user cannot
create a guided-capture session from a case today — the acceptance criterion CCAP-012 was written
against ("a staff user creates a session from a case") is false in the live app despite the component
existing.

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
