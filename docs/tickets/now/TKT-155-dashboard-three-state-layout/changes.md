# Changes — TKT-155: Simplify the dashboard around Not Ready, Review and Held

## Status
Implemented on `codex/tkt-155-dashboard`; lifecycle status is intentionally left for the dispatching orchestrator.

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
