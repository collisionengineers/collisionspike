# Changes — TKT-155: Simplify the dashboard around Not Ready, Review and Held

## Status
The core dashboard was merged in PR 61 and deployed on 2026-07-12. Independent live verification then
failed at 390px width and on focus-indicator contrast, so the dispatching orchestrator returned the
ticket from `verify` to `now`. Exact failure evidence is recorded in `verification.md`; the repair is
not yet deployed.

## Independent verification follow-up — 2026-07-12
- Passed all three live queue-card drill-throughs and their unique accessible names.
- Passed keyboard order and visible-focus presence.
- Failed the translucent red focus halo at approximately 2.80:1 against white.
- Failed the 390px layout because the 240px navigation rail left cards only about 87px wide and clipped their contents.
- Left true 200% zoom and short-height proof pending rather than inferring success from viewport emulation.

## Commits
- `f1bfcfe` — replace the dashboard cockpit with the three-queue overview, sectioned Inbox health, responsive skeleton and contract tests.

## Files changed
- `mockup-app/src/screens/Dashboard.tsx`
- `mockup-app/src/screens/dashboard-layout.ts`
- `mockup-app/src/screens/dashboard-layout.test.ts`
- `mockup-app/src/components/Skeletons.tsx`
- `mockup-app/src/components/AppShell.tsx`
- `mockup-app/src/data/hooks.ts`
- `mockup-app/src/data/rest-client.ts`
- `mockup-app/src/data/rest-client.test.ts`

## Summary
- Replaced the pipeline, Held banner, oldest-first action lists and lower queue snapshot with one centred group of equal Not ready, Review and Held cards.
- Bound those cards directly to the dashboard's canonical `queueCounts` map and the three existing queue routes; the left-navigation count path remains unchanged.
- Kept Inbox and Today / this week as balanced secondary panels, and removed the lifetime metric from the windowed throughput panel.
- Made Inbox totals an independent, retryable section. A count-read failure no longer looks like an honest zero or takes down the healthy queue and throughput sections; the navigation's non-critical Inbox badge still degrades locally.
- Added stable loading shapes, explicit refresh state, responsive one-to-three / one-to-two column rules, semantic buttons, unique accessible names and icon-plus-text status cues.
- Added component contract coverage for the three cards, removed regions, routes/counts, empty and partial-error states, reading order, responsive structure and banned user-facing language.
