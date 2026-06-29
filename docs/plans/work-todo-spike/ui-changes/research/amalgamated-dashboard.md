# Research pack: amalgamated dashboard

## Source ticket

`docs/plans/work-todo-spike/ui-changes/amalgamated-dashboard.md`

The ticket asks for a compact combined dashboard: bring the email overview and intake overview together, keep it non-cluttered, and move detailed controls to specific pages.

## What is happening

The live SPA currently keeps the case dashboard and inbound email work as separate surfaces:

- Routes split the case dashboard and inbox at `mockup-app/src/routes.tsx:31-33`.
- `useDashboard` only loads case-oriented metrics: `liveCounts`, `throughput`, `agingExceptions`, and `pipelineStages` in `mockup-app/src/data/hooks.ts:104-123`.
- Email counts are loaded through a separate hook and API call: `useInboundCounts` in `mockup-app/src/data/hooks.ts:206-210` and `inboundEmailCounts` in `mockup-app/src/data/rest-client.ts:193-214`.
- The Data API dashboard route builds its summary by loading all cases in `api/src/functions/dashboard.ts:55-58` and then deriving live counts, throughput, aging, queue, reason, and pipeline summaries in `api/src/functions/dashboard.ts:60-199`.
- Inbound counts live in a separate route at `api/src/functions/inbound.ts:60-77`.

The result is two partial command centres: the dashboard knows about case progress but not incoming mail pressure, while the inbox knows about receiving-work/query/other mail buckets but not the wider case workload.

## Why it comes from the current design

The front end and API contracts were built around separate case and email endpoints. The dashboard contract does not have a place for inbound email summary data, so the UI cannot combine the two without either adding another parallel request in the page or changing the dashboard summary contract.

There is also an existing metric drift risk: `mockup-app/src/screens/Dashboard.tsx:31-42` documents that throughput should be a windowed performance measure, but `Dashboard.tsx:421-484` renders `Sent to EVA (total)` from the cumulative submitted stage. That makes the dashboard more confusing when new email counts are added.

The binding dashboard review also matters here. `docs/reviews/190626/dashboard/review.md:11-19` simplified the case pipeline to handler terms such as `New`, `Not ready`, `Review`, and `Submitted`, and removed older implementation-shaped buckets. The combined dashboard should not reintroduce internal processing labels.

## Affected files

- `mockup-app/src/screens/Dashboard.tsx` - current case dashboard layout, pipeline strip, held bar, throughput strip, and action list.
- `mockup-app/src/screens/Inbox.tsx` - current inbound email category tabs and message list controls.
- `mockup-app/src/data/hooks.ts` - separate dashboard and inbound count hooks.
- `mockup-app/src/data/rest-client.ts` - separate dashboard and inbound count REST calls.
- `api/src/functions/dashboard.ts` - case dashboard summary contract and derived metrics.
- `api/src/functions/inbound.ts` - inbound email count route.
- `packages/domain/src/dto/index.ts` - shared DTO surface if a combined dashboard summary is added.
- `docs/reviews/190626/dashboard/review.md` and `docs/reviews/190626/dashboard/checklist.md` - binding dashboard requirements.

## Changes that would resolve it

1. Add a compact combined summary contract for the dashboard.
   - Include case counts, blocked/review counts, and inbound counts for receiving-work, queries, other, and untriaged.
   - Keep detailed filtering and bulk handling on `/inbox`; the dashboard should deep-link into those focused views.

2. Make the dashboard first screen a workload cockpit.
   - Use small count tiles or tight rows for incoming mail, new cases, cases needing review, held/not-ready cases, and recently submitted cases.
   - Do not expose implementation terms in rendered copy. Use handler-facing labels such as `New mail`, `New cases`, `Needs review`, `Not ready`, and `Sent`.

3. Fix the throughput wording while touching the dashboard.
   - Separate cumulative submitted counts from windowed throughput.
   - Avoid `total` next to windowed labels unless the metric is actually lifetime cumulative.

4. Add tests at the contract boundary.
   - Unit-test the dashboard aggregation route with inbound counts present.
   - Component-test the compact dashboard state for empty, loading, error, and non-zero counts.

## Open checks before implementation

- Confirm whether the combined dashboard should make a second request to `/api/inbound/counts` or whether the Data API should return one combined payload. A combined payload is cleaner for the UI and easier to cache consistently.
- Check the deployed SPA after implementation because the dashboard was already heavily changed by the 190626 review pass.
