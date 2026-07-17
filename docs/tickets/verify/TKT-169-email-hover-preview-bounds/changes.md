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

## Independent review — 2026-07-17 (PR #106)

An independent agent review of the remediation above (before deploy) found two real issues, both
fixed in a follow-up commit:

- **Row-unmount leak (high)**: a row's pending 150ms open-timer, or its already-open preview,
  survived the row unmounting (search/filter/page change removing it from `pageItems`), leaving the
  shared popover anchored to a detached element or opening late for a row no longer on screen. Fixed
  by adding `releaseRow(rowId)` to the controller, called from each `SubjectPreviewCell`'s unmount
  effect — cancels a pending open, or closes immediately if that row owned the open preview. Two new
  regression tests cover both cases.
- **ARIA regression (medium)**: bypassing `<PopoverTrigger>` for the external-trigger positioning
  pattern meant Fluent no longer auto-wired the trigger-side `aria-expanded`/`aria-haspopup`/
  `aria-controls`. Fixed by setting them by hand on the subject link, pointing at the shared
  surface's new stable `id`.
- A third, low-severity note (the popover `target` is threaded via `useState` rather than Fluent's
  imperative `positioningRef`/`setTarget` API) was accepted as-is — the target must switch between
  many different row elements, so state-driven reactivity is the appropriate tool here, not a single
  stable ref; React 18 batching limits the extra-render cost the reviewer flagged.

Re-verified after the fixes: `apps/web` full suite 556/556 pass (132 in the inbox feature,
including the 2 new unmount tests), `npm run build` clean.

## Deployed — 2026-07-17

- PR #106 (`e-mail-preview-fixer` → `main`): https://github.com/collisionengineers/collisionspike/pull/106
- Built `apps/web` (`npm run build`), copied `staticwebapp.config.json` into `dist/`, deployed with
  `swa deploy ./dist --env production` → `cespk-spa-dev` → "Project deployed 🚀"
  (`https://proud-sky-04e318b03.7.azurestaticapps.net`).
- Post-deploy HTTP smoke check: `GET /` → **200**, `Content-Security-Policy` header present and
  matching `staticwebapp.config.json`; served `index.html` references `assets/index-B0zP8REP.js` —
  the build produced by this change (confirmed the bundle hash, not a stale cache).
- This was an HTTP-only smoke check, not a browser/UI check — the operator is doing the signed-in
  Chrome pass (desktop/1024px/390px/short-viewport/200% zoom, keyboard, console) separately. Until
  that lands, this ticket stays in `now`/pending live UI verification, not `done`.
- `LIVE_FACTS.json` was **not** updated — its dated entries reflect comprehensive environment-wide
  verification sweeps, not single-ticket code-only deploys; this deploy's evidence lives here
  instead, consistent with prior single-ticket SPA deploys (e.g. TKT-098).
