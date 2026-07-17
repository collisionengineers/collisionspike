# Verification — TKT-169: Keep long email previews inside the visible window

## Verdict
TESTED (offline) — implementation, full tests and production build pass; deployment and independent live verification remain required.

## Required evidence
- Focused interaction/layout tests and full SPA build.
- Signed-in Chrome screenshots at desktop and constrained viewport sizes using a long live email.
- Keyboard/focus and internal-scroll proof with no viewport clipping.

## Offline evidence — 2026-07-13
- Focused preview layout/interaction contract: PASS.
- Full SPA: 469 tests PASS.
- Domain and production SPA builds: PASS.

## Follow-up verdict — 2026-07-13

PENDING for the expanded acceptance. Add fake-timer coverage for the 150 ms open/100 ms close bounds,
pointer transfer and stale-row cancellation, then record signed-in hover timing and placement at viewport
edges.

## Independent verification update — 2026-07-14

### Verdict

FAILED — the expanded acceptance is not met in the signed-in live SPA.

### Evidence

- Acceptances 1/5 — failed: at 1024×600 the preview ended at x=1033, clipping 9px; at 390×844 it
  began at x=-153, clipping 153px off the left edge.
- Acceptance 2 — partial pass: a long live preview was bounded to 420px high with
  `scrollHeight=956` and `clientHeight=418`, confirming internal scrolling. Horizontal containment
  still fails.
- Acceptance 3 — pass for sampled short content: roughly 185px high with no unnecessary scroll.
- Acceptance 4 — partial pass: pointer transfer kept the preview open at least 220ms. Keyboard/focus
  was not exercised.
- Acceptance 6 — source verified: subject remains the selection link and preview is separate, but the
  hover trigger is the body snippet rather than subject.
- Acceptance 7 — failed: the dedicated test has only two source-string assertions and no rendered
  placement, keyboard, fake-timer, traversal or stale-content coverage.
- Acceptance 8 — failed: signed-in Chrome reproduced clipping at 1024px and 390px; no complete
  desktop/short/mobile/console set exists.
- Acceptance 9 — failed: one preview opened within the measured 48ms operation, but rapid transit
  produced two surfaces still present at 129ms and 177ms, exceeding the 100ms close bound.
- Acceptance 10 — failed: implementation hard-codes `position: 'after', align: 'center'`; it does not
  choose above/below around the pointer.
- Acceptance 11 — failed: pointer transfer passed, but rapid traversal retained stale overlapping
  previews.

### Pending / gaps

- Controlled single-preview state and stale cancellation.
- Close within 100ms and acceptance-aligned subject trigger.
- Edge-aware above/below placement that avoids adjacent columns.
- Fake-timer interaction coverage.
- Keyboard, short viewport, true 200% zoom and console-error proof.

### How to re-verify

1. Add rendered fake-timer tests for 150ms/100ms, pointer transfer, rapid traversal, stale
   cancellation, keyboard and edge placement.
2. Deploy the corrected build.
3. Repeat signed-in desktop, 1024px, 390px, short-height and true-200%-zoom checks on top/middle/bottom
   rows.
4. Record bounding rectangles, timings, adjacent-column visibility, internal scrolling, keyboard and
   console.
5. Prove exactly one correctly matched preview exists throughout rapid traversal.

### Confidence + unread surfaces

**High confidence.** Every artifact/screenshot plus relevant source/tests were inspected; signed-in
Chrome covered desktop, 1024px and 390px. Keyboard, true 200% zoom, short-height and console remain
unverified.

## Remediation offline verification — 2026-07-17

### Verdict

TESTED (offline only) — the specific defects the 2026-07-14 pass found have been rebuilt and are
covered by real rendered/interaction tests; signed-in live re-verification is still required and
the FAILED verdict above stands until that evidence exists.

### What changed (see `changes.md` for detail)

- Placement: `position:'after'` (sideways, no fallback) → `position:'below'`, `fallbackPositions:['above']`.
- Single shared controlled `Popover`/`PopoverSurface` (one per grid, not one per row) — makes a
  stale/duplicate preview during rapid traversal structurally impossible.
- Hand-rolled 150ms open-intent / 100ms close-intent timers (Fluent's `openOnHover` has no open
  delay); entering the surface cancels a pending close.
- The subject is now the hover/focus trigger (previously the separate body-snippet span).
- `inbox-preview-contract.test.ts` (source-string assertions) replaced by
  `subject-preview.test.tsx` (rendered, `vi.useFakeTimers()`, real DOM interaction).

### Offline evidence

- `npx vitest run` from `apps/web`: 554/554 tests pass, including 9 new tests in
  `subject-preview.test.tsx` covering the 150ms/100ms bounds, pointer-transfer-keeps-open,
  rapid-traversal no-stale-duplicate, keyboard open/blur, and the positioning configuration.
- `npm run build` (`tsc -b --force && vite build`) from `apps/web`: clean.
- Real placement-flip-at-viewport-edges behavior is not meaningfully testable in jsdom (no layout
  engine) — the unit tests assert the positioning *configuration* only; actual edge-flip/
  containment proof remains a live requirement below.

### Still required (unchanged from the 2026-07-14 pending list)

1. Deploy the corrected build.
2. Signed-in Chrome pass at desktop-wide, 1024×600, 390×844, a short-height viewport, and true
   200% zoom, at top/middle/bottom rows: capture the surface's bounding rect at every size
   (no clipping), confirm above/below-only placement with no adjacent-column overlap, confirm
   internal scroll on a long message and compactness on a short one, confirm pointer transfer and
   the ~100ms close, confirm no stale preview during rapid row travel, run a keyboard-only pass,
   and confirm a clean console throughout.
3. Only once that evidence is recorded does this verdict move from TESTED (offline) to a live PASS.
