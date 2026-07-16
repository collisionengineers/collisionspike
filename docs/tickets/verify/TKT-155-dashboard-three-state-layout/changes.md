# Changes — TKT-155: Simplify the dashboard around Not Ready, Review and Held

## Status
The core dashboard was merged in PR 61 and deployed on 2026-07-12. Independent live verification then
failed at 390px width and on focus-indicator contrast, so the dispatching orchestrator returned the
ticket from `verify` to `now`. The responsive and focus repair is implemented and tested offline in
`76fe549`; it is not yet deployed or independently re-verified live.

## Independent verification follow-up — 2026-07-12
- Passed all three live queue-card drill-throughs and their unique accessible names.
- Passed keyboard order and visible-focus presence.
- Failed the translucent red focus halo at approximately 2.80:1 against white.
- Failed the 390px layout because the 240px navigation rail left cards only about 87px wide and clipped their contents.
- Left true 200% zoom and short-height proof pending rather than inferring success from viewport emulation.

## Responsive and accessibility repair — 2026-07-12
- At 800px and below, the shell now defaults to a 60px icon rail instead of reserving the fixed 240px
  rail. At 390px this leaves a calculated 298px usable content width after the compact padding, rather
  than the failed approximately 87px cards.
- Expanding the compact rail overlays the page with an explicit close control and backdrop; it does not
  reflow or squeeze the dashboard. Direct Not ready, Review and Held links remain available and retain
  accessible names in the icon-only state.
- The top bar and page padding compact at the same breakpoint. Global search remains present; the page
  title and avatar yield only at the narrowest widths so controls do not clip.
- Compact navigation now moves focus to its close control, closes on Escape or navigation, and restores
  focus to the menu button.
- Replaced the translucent red focus halo with a solid two-layer recipe: a white separator for the dark
  rail plus a solid CE-red outer stroke for white cards. Contrast tests pin both adjacent-surface pairings
  at or above the WCAG 3:1 focus-indicator threshold.
- Added component and pure-layout tests for desktop, 1024px, tablet, 390px mobile and the CSS viewport
  produced by 200% zoom. Final offline gates: focused regression set 35/35, full SPA 447/447, and the
  production build passed. The existing large-bundle warning remains unchanged.

## Commits
- `76fe549` — make the app shell compact/overlay-responsive and replace the translucent focus halo with a contrast-pinned solid recipe.
- `f1bfcfe` — replace the dashboard cockpit with the three-queue overview, sectioned Inbox health, responsive skeleton and contract tests.

## Files changed
- `apps/web/src/features/dashboard/Dashboard.tsx`
- `apps/web/src/features/dashboard/dashboard-layout.ts`
- `apps/web/src/features/dashboard/dashboard-layout.test.ts`
- `apps/web/src/shared/ui/Skeletons.tsx`
- `apps/web/src/shared/ui/AppShell.tsx`
- `apps/web/src/shared/ui/AppShell-responsive.test.ts`
- `apps/web/src/shared/ui/app-shell-layout.ts`
- `apps/web/src/shared/ui/app-shell-layout.test.ts`
- `apps/web/src/theme/theme.css`
- `apps/web/src/theme/contrast.test.ts`
- `apps/web/src/data/hooks.ts`
- `apps/web/src/data/rest-client.ts`
- `apps/web/src/data/rest-client.test.ts`

## Summary
- Replaced the pipeline, Held banner, oldest-first action lists and lower queue snapshot with one centred group of equal Not ready, Review and Held cards.
- Bound those cards directly to the dashboard's canonical `queueCounts` map and the three existing queue routes; the left-navigation count path remains unchanged.
- Kept Inbox and Today / this week as balanced secondary panels, and removed the lifetime metric from the windowed throughput panel.
- Made Inbox totals an independent, retryable section. A count-read failure no longer looks like an honest zero or takes down the healthy queue and throughput sections; the navigation's non-critical Inbox badge still degrades locally.
- Added stable loading shapes, explicit refresh state, responsive one-to-three / one-to-two column rules, semantic buttons, unique accessible names and icon-plus-text status cues.
- Added component contract coverage for the three cards, removed regions, routes/counts, empty and partial-error states, reading order, responsive structure and banned user-facing language.
