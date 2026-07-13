---
id: TKT-169
title: Keep long email previews inside the visible window
status: now
priority: P2
area: ui
tickets-it-relates-to: [TKT-009, TKT-054, TKT-070, TKT-098]
research-link: docs/tickets/now/TKT-169-email-hover-preview-bounds/evidence/hover-preview-overflow-live.png
plan: PLAN-004
---

# Keep long email previews inside the visible window

## Problem
Hovering a long email snippet opens a tooltip containing the full message. The live tooltip can begin above the browser window and extend beyond the available height, leaving the start or end cut off and impossible to read.

## Evidence
- [Live inbox screenshot](./evidence/hover-preview-overflow-live.png) — the long preview is positioned above the inbox content and clipped by the top of the viewport.
- `mockup-app/src/screens/Inbox.tsx` passes the entire `bodyPreview` string directly to a default Tooltip with no bounded content container or scrolling behavior.

## Proposed change
Replace the unbounded text tooltip with a viewport-aware preview surface. It must choose a fitting placement, reserve margins from the app chrome and viewport edges, and scroll its own body when the message is longer than the available space. The short inline snippet remains one line in the table.

## Acceptance
- Opening a long email preview never places content above, below or horizontally outside the visible viewport.
- Preview height is bounded by the available viewport; long content scrolls inside the preview without scrolling or widening the inbox table.
- Short previews remain compact and do not acquire unnecessary empty height.
- The preview works by pointer and keyboard/focus, remains open while its content is being read or scrolled, and has an accessible name/description.
- Placement remains usable at wide desktop, 1024px, 390px mobile, short viewport and 200% zoom without clipped text or controls.
- The inline table row stays a concise single-line preview; selecting the email still opens the existing full preview panel.
- Component or layout-contract tests cover maximum height, overflow, placement boundary and keyboard access.
- Signed-in live Chrome verification records a long-message preview at desktop and short/mobile viewport sizes with no clipping or console errors.

## Research
Distilled 2026-07-13 from the supplied live inbox screenshot. The defect is in the compact hover/focus preview, not the existing full email preview panel.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)

