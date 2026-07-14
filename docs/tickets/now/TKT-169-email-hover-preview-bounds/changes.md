# Changes — TKT-169: Keep long email previews inside the visible window

## Status
Implemented offline; deployment and independent live verification remain.

## Planned scope
- Replaced the unbounded full-message Tooltip with a viewport-positioned Popover that opens from
  pointer hover, click or keyboard focus.
- The preview is limited to the viewport on both axes and scrolls long text internally; the concise
  table snippet and existing full email panel are unchanged.
- Added accessible trigger/surface names and a source-level layout contract covering positioning,
  viewport bounds and internal overflow.

## Offline verification
- Focused status/preview regression: 4 tests passed.
- Full SPA: 42 files / 469 tests passed.
- Domain and production SPA builds passed; ticket and documentation gates passed.

## Follow-up scope — 2026-07-13

The supplied operator timing report adds measurable open/close responsiveness, cursor-aware placement and
rapid-row traversal behavior. The earlier layout-only tests do not prove those interactions.
