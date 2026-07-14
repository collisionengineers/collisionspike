---
id: TKT-182
title: Keep long email references inside their column
status: backlog
priority: P3
area: ui
tickets-it-relates-to: [TKT-054, TKT-157, TKT-169, TKT-190]
research-link: docs/tickets/backlog/TKT-182-long-reference-layout/evidence/reference-layout-matrix.md
plan: PLAN-004
---

# Keep long email references inside their column

## Problem
Long references in the inbox can paint over the Received and Status columns. The row then becomes difficult to scan and may hide the time or case link, especially in a narrower window or at increased browser zoom.

## Evidence
- [Operator source material](./evidence/operator-source/) shows a long reference crossing into the neighbouring Received column.
- The supplied value `NAD/MOHAMMED/S460958.001` is a concrete regression example and is not an exceptional data shape that may be discarded.
- Cross-size screenshots are to be recorded at [reference-layout-matrix.md](./evidence/reference-layout-matrix.md).

## Proposed change
PROPOSED (not built):
- Give Reference, Received, Status and row actions explicit non-overlapping layout areas.
- Constrain long references visually while preserving the complete value for focus, hover, assistive technology and copying.
- Switch to a labelled stacked row at the narrow breakpoint instead of squeezing metadata until it collides.

## Acceptance
- **A1.** References from an ordinary eight-character value through an unbroken 80-character value, including `NAD/MOHAMMED/S460958.001`, never paint into, underneath or over the Received, Status or action areas at any supported inbox width.
- **A2.** At the desktop row layout a long reference is contained by wrapping or ellipsis within its own area, and its complete exact value is available on both hover and keyboard focus, is exposed to assistive technology, and can be copied without the shortened presentation text.
- **A3.** At the narrow inbox breakpoint, Reference, Received and Status become clearly labelled stacked values in a stable reading order; no value or row action is hidden and the page does not gain horizontal scrolling because of a long reference.
- **A4.** At 200% browser zoom on a 1280-pixel-wide viewport, the reference, received time/date, status link and primary row actions remain legible, non-overlapping and keyboard reachable.
- **A5.** Empty and ordinary-length references keep their current placeholder and scan-friendly row density, and the change does not alter the stored reference, sorting, filtering or row destination.
- **A6.** Automated layout coverage includes empty, eight-character, supplied long and unbroken 80-character references at desktop, narrow and 200% zoom-equivalent widths.

## Validation
- Add component fixtures for all four reference classes and assertions for the full accessible/copy value.
- Add screenshot or bounding-box regression checks proving that the four row areas do not intersect at the required widths and zoom.
- Run keyboard, tooltip/focus, screen-reader and page-overflow checks.
- Run existing inbox sorting, filtering and navigation tests to prove no data behaviour changed.
- After deployment, locate a real signed-in row with the supplied or longer reference and capture the desktop, narrow and 200% states in the planned evidence matrix.

## Research
Distilled 2026-07-13 from the operator’s long-reference screenshot. The required viewport dimensions, element bounds and signed-in screenshots belong in [evidence/reference-layout-matrix.md](./evidence/reference-layout-matrix.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator layout note](./evidence/operator-source/info.md)
- [Planned research evidence](./evidence/reference-layout-matrix.md)
