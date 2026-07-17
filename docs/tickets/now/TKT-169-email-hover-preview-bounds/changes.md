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

## Remediation — 2026-07-17

Rebuilt the preview to address every FAILED/partial item from the 2026-07-14 independent
verification (see `verification.md`):

- **Root cause of the clipping**: the popover was hard-coded to `position: 'after'` (sideways),
  which put horizontal containment on Floating UI's `flip`/side-selection axis — and there was no
  `fallbackPositions` for it to flip to, so it never corrected. Switched to `position: 'below'`
  with `fallbackPositions: ['above']`; a top/bottom placement puts horizontal containment on
  Floating UI's `shift` main-axis (enabled by default), and the vertical flip now has an
  alternative to try. This also stops the preview from ever opening sideways over the
  VRM/Ref/Status/Actions columns.
- **Single shared controller, not one Popover per row**: new `apps/web/src/features/inbox/subject-preview.tsx`
  exports `PreviewControllerProvider` (one shared `Popover`/`PopoverSurface` for the whole grid,
  anchored via Fluent's documented external-trigger `positioning.target` pattern — no
  `<PopoverTrigger>`, no `openOnHover`) and `SubjectPreviewCell`. A single `openRowId` makes "never
  more than one preview open" true by construction, so rapid pointer travel across rows can't leave
  a stale/duplicate preview.
- **Custom 150ms open / 100ms close timing**: Fluent's `openOnHover` has no built-in open delay
  (only a close delay), so the controller hand-rolls both with `setTimeout`/`clearTimeout`, wired
  to pointer enter/leave on the trigger and the surface (entering the surface cancels a pending
  close, so reading/scrolling the preview keeps it open). Keyboard focus opens immediately (no
  hover-intent debounce — a deliberate action has no travel jitter); blur/Escape close it.
- **Subject is now the hover/focus trigger** (previously the separate one-line body-snippet span
  was the trigger). The subject keeps its existing click-to-select behavior and the separate full
  email preview panel unchanged; the one-line snippet is now inert summary text only.
- **Test rewritten**: deleted `inbox-preview-contract.test.ts` (raw `.toContain()` string
  assertions on the file text — the acceptance-7 defect). New
  `apps/web/src/features/inbox/subject-preview.test.tsx` renders the real components with
  `vi.useFakeTimers()` and asserts: the 150ms open bound, the 100ms close bound, that leaving the
  trigger before 150ms cancels the pending open, that moving the pointer into the surface keeps it
  open, that rapid traversal across two rows never leaves a stale/duplicate preview, keyboard
  open/blur/close, and the positioning configuration (`position`/`fallbackPositions`) directly.
  Real flip/shift-at-viewport-edges behavior can't be meaningfully unit-tested in jsdom (no layout
  engine) — that stays a live Chrome requirement.
- **Fixed a pre-existing test-infrastructure gap**: `apps/web/src/test/setup-dom.ts` stubbed
  `ResizeObserver` as non-writable, which crashed on mounting any real Fluent `Popover` (Fluent's
  positioning code assigns to it). No test in the repo had previously rendered a real
  Popover/Tooltip/Menu, so this had gone unnoticed. Added `writable: true`.

### Offline verification — 2026-07-17

- `apps/web`: `npx vitest run` — 554/554 tests pass (full suite, all files), including the new
  `subject-preview.test.tsx`.
- `apps/web`: `npm run build` (`tsc -b --force && vite build`) — clean.

### Still required before this ticket can close

Deployment and a signed-in Chrome pass (desktop, 1024×600, 390×844, short viewport, 200% zoom, top/
middle/bottom rows, keyboard-only pass, console-clean) — see `verification.md`. The 2026-07-14
FAILED verdict is **not** superseded until that live evidence exists.
