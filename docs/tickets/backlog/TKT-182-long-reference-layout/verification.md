# Verification — TKT-182: Keep long email references inside their column

## Verdict
PENDING — no implementation, offline layout result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — references never overlap adjacent areas | Bounding-box or visual regression tests use eight-character, supplied long and unbroken 80-character references at every supported inbox width and assert no intersection with Received, Status or actions. | Signed-in desktop/narrow screenshots and measured element bounds on real ordinary and long-reference rows show no overlap. | PENDING |
| A2 — full value remains available and copyable | Component tests assert contained presentation plus full hover/focus text, accessible name and clipboard value for long references. | Signed-in pointer, keyboard-focus, accessibility-tree and copy/paste proof reproduces the complete exact reference. | PENDING |
| A3 — narrow rows stack without page overflow | Narrow-layout visual and DOM-order tests assert labelled stacked metadata, all actions present and no page-level horizontal overflow. | Signed-in narrow viewport screenshot and page-width measurement show Reference, Received, Status and actions in stable order with no horizontal page scroll. | PENDING |
| A4 — 200% zoom remains usable | 200% zoom-equivalent visual, focus-order and hit-target tests show all required values/actions without intersection or clipping. | Signed-in browser at 200% zoom on a 1280-pixel-wide viewport demonstrates legibility and keyboard reachability and records the screenshot. | PENDING |
| A5 — normal rows and behaviour unchanged | Fixtures for empty/ordinary references plus sorting, filtering, stored-value and navigation regression suites pass unchanged. | Signed-in spot checks of empty and ordinary rows retain density/placeholders; sorting, filtering and opening the row produce the same live results. | PENDING |
| A6 — required automated matrix exists | Test manifest and CI output enumerate empty, eight-character, supplied long and unbroken 80-character cases at desktop, narrow and zoom-equivalent sizes. | The same four content classes are demonstrated in the signed-in deployed UI where live examples exist; synthetic layout-only proof is clearly separated for absent live classes. | PENDING |

## Required artifact
- [Reference layout matrix](./evidence/reference-layout-matrix.md) — PENDING.
