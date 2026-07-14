# Verification — TKT-180: Use one icon for each app concept

## Verdict
PENDING — no approved semantic map, implementation, offline test result or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — four core concepts use one icon everywhere | Approved icon inventory plus rendered tests compare Inbox, Not ready, Review and Held across navigation, dashboard, headings and summaries. | Paired signed-in screenshots of every listed surface demonstrate the same glyph for each concept. | PENDING |
| A2 — one shared semantic source | Unit tests for the semantic map and static/source evidence show all audited consumers import the shared map/component rather than local mappings. | Browser component inspection or built-source trace from the signed-in deployment matches each rendered audited icon to the approved map. | PENDING |
| A3 — distinct concepts remain distinguishable | The approved audit lists every duplicate glyph and its rationale; automated mapping tests reject unapproved collisions. | Signed-in review of adjacent dashboard/navigation/queue concepts confirms no ambiguous unapproved reuse in context. | PENDING |
| A4 — Fluent icons only for workflow concepts | Dependency/source and built-asset checks find no new custom SVG, generated or bitmap workflow icon, with explicit evidence/content/brand exemptions. | Signed-in network/DOM inspection of audited workflow icons shows Fluent-rendered glyphs and no custom/bitmap workflow asset request. | PENDING |
| A5 — text and accessible naming carry meaning | Accessibility/rendered tests prove visible text, control names, decorative hiding and no icon/colour-only status. | Signed-in accessibility-tree and keyboard inspection of representative navigation, card, status and action icons confirms meaningful names and visible text. | PENDING |
| A6 — all interaction/high-contrast/responsive states hold | Visual and component tests cover default, hover, focus, selected, disabled, high contrast, desktop/narrow and 200% zoom. | Signed-in screenshots and keyboard checks capture the required states at desktop, narrow, high contrast and 200% zoom without misalignment. | PENDING |

## Required artifact
- [Icon surface audit](./evidence/icon-surface-audit.md) — PENDING.
