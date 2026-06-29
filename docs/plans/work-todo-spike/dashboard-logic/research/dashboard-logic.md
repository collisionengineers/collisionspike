# Dashboard logic research

## Ticket

Source stub: `docs/plans/work-todo-spike/dashboard-logic/dashboard-logic.md`

The stub is empty. The strongest nearby signal is `docs/plans/work-todo-spike/ui-changes/amalgamated-dashboard.md`, which asks for a compact dashboard combining the e-mail overview and the intake overview.

## Short finding

The case dashboard has a working aggregate skeleton, and live Azure exposes the dashboard functions. The open work is to define a single dashboard contract that joins the case pipeline with inbound e-mail triage and pins down the count semantics.

The current implementation has several logic risks:

- case dashboard and inbox dashboard are separate;
- stage counts and queue counts are not the same, but stage clicks land on broader queues;
- one "today / this week" strip includes a lifetime total;
- action-reason and due-date dashboard fields are read but not consistently maintained;
- several dashboard routes repeatedly load every case and aggregate in memory;
- `api/src` is behind the deployed `api/dist` / live route surface.

## Current Source Path

- SPA dashboard fetches a bundle through `useDashboard`: `mockup-app/src/data/hooks.ts:104-123`.
- REST client calls four dashboard endpoints: `mockup-app/src/data/rest-client.ts:147-159`.
- API dashboard routes are registered from `api/src/functions/dashboard.ts` through `api/src/index.ts:11-19`.
- Each dashboard route loads all cases and filters/counts in memory: `api/src/functions/dashboard.ts:55-58`, then repeated in `liveCounts`, `throughput`, `agingExceptions`, `queueCounts`, `reasonCounts`, and `pipelineStages`.
- Queue rows use the same adapted case list and `filterQueue`: `api/src/functions/cases.ts:291-303`.
- Queue/stage taxonomy is defined in `packages/domain/src/model/queues.ts:54-141`.
- Queue filtering lives in API mappers, with `onHold` overriding a case into Held: `api/src/lib/mappers.ts:525-539`.

## Live Azure Evidence

Read-only Azure CLI on 2026-06-29 showed `cespk-api-dev` exposes the dashboard/queue/inbox routes:

- `liveCounts`
- `throughput`
- `agingExceptions`
- `queueCounts`
- `reasonCounts`
- `pipelineStages`
- `casesForQueue`
- `inboundEmails`
- `inboundEmailCounts`
- `recentActivity`
- `activityForCase`

No-auth probes by the live/API worker returned expected `401` responses, which means the host and auth boundary are alive.

There is source/live drift:

- `rg "app\\.http\\(" api/src/functions -n | wc -l` returns `44`.
- `rg "app\\.http\\(" api/dist/functions -n | wc -l` returns `49`.
- `api/dist` contains `patchCase`, `internalCasesEnrichment`, `internalInboundLinkReply`, `internalCaseBoxFolderGet`, and `internalCaseBoxFolderStamp`; `api/src` and `deploy/api/main.cjs` do not.
- Live Azure also reports 49 functions, matching `api/dist`, not `api/src`.

Before implementing dashboard changes, restore source parity so new work is not built on stale source.

## Binding Requirements

- Binding reviews outrank older plans: `docs/reviews/README.md:3`.
- The 190626 dashboard review says to remove duplicate "drainable now" content, drop Parsing, drop Box, combine awaiting/chasing states into Not ready, and fold ready cases into Review: `docs/reviews/190626/dashboard/review.md:3-19`.
- The checklist records that the target dashboard taxonomy became `New -> Not ready -> Review -> Submitted`: `docs/reviews/190626/checklist.md:91-99`.
- Queue review requires provider filters to include only providers with a case in the active queue, hide status filtering where it is not useful, and add a queue for e-mails/cases that cannot pass through automatically: `docs/reviews/190626/queues-cases/queues/review.md:1-10`.
- The newer dashboard/change ticket asks for the e-mail overview and intake overview to be amalgamated: `docs/plans/work-todo-spike/ui-changes/amalgamated-dashboard.md:1`.

## Main Gaps

### 1. Dashboard Does Not Yet Include Inbox Triage

Current dashboard data only includes case aggregates:

- `liveCounts`
- `throughput`
- `agingExceptions`
- `pipelineStages`

Evidence: `mockup-app/src/data/hooks.ts:104-123`.

Inbound counts exist separately:

- API route: `api/src/functions/inbound.ts:60-77`.
- REST client: `mockup-app/src/data/rest-client.ts:193-211`.
- App shell nav pill: `mockup-app/src/components/AppShell.tsx:248-254`.
- Inbox screen tabs: `mockup-app/src/screens/Inbox.tsx`.

Likely resolution: add a compact inbound summary to the dashboard contract: active receiving-work, queries, other, and untriaged counts, with deep links to the Inbox tabs.

### 2. Stage Counts Do Not Equal Queue Counts

The queue model and stage model intentionally differ:

- Queue `not-ready` includes `new_email`, `ingested`, `missing_images`, `missing_required_fields`, `needs_review`, and `linked_to_instruction`: `packages/domain/src/model/queues.ts:54-70`.
- Funnel stage `new` includes `new_email` and `ingested`; funnel stage `not_ready` excludes those and includes only the later not-ready statuses: `packages/domain/src/model/queues.ts:122-131`.
- Dashboard maps both the `new` and `not_ready` stage clicks to `/queue/not-ready`: `mockup-app/src/screens/Dashboard.tsx:57-60`.

This can make a clicked stage show a queue whose row count is broader than the displayed stage count. That may be acceptable if the UI says it opens the wider queue; otherwise the queue route needs a stage/status filter.

### 3. Lifetime Total Is Mixed Into a Windowed Strip

The dashboard comment says the screen should not show lifetime counters: `mockup-app/src/screens/Dashboard.tsx:31-42`.

But the rendered "Today / this week" strip includes `Sent to EVA (total)`, derived from the cumulative submitted pipeline stage: `mockup-app/src/screens/Dashboard.tsx:421-484`.

Resolution options:

- remove the total and keep only windowed metrics;
- rename/move the total to a separate submitted/archived context;
- add a true windowed `sentToEvaToday` or `sentToEvaThisWeek` field.

### 4. Action Reasons And Due Dates Are Read But Not Maintained

Dashboard aging and reason facets depend on `action_reason_code` and `date_due`:

- Schema columns: `migration/assets/schema/050_case.sql:42-43`.
- Mapper reads `actionReason`: `api/src/lib/mappers.ts:203`.
- Aging rows read `c.actionReason` and `c.dateDue`: `api/src/functions/dashboard.ts:112-130`.
- Reason facets tally `c.actionReason`: `api/src/functions/dashboard.ts:151-168`.

The create/recompute paths mainly update `status_code`, not action reason or due date:

- Manual create computes status but does not derive a reason/due: `api/src/functions/cases.ts:177-230`.
- Internal recompute updates only `status_code`: `api/src/functions/internal.ts:123-145`.
- Intake create inserts status/source/provider fields, not action reason/due: `api/src/functions/internal.ts:349-383`.

Likely resolution: add a pure `actionReasonForCase` / due policy helper and persist or compute it consistently after evidence, field, merge, hold, and status changes.

### 5. Error Is Both Terminal And Held

`error` is terminal in the status guard: `packages/domain/src/contracts/case-status.ts:54-67`.

But `error` is also routed into Held/actionable queues: `packages/domain/src/model/queues.ts:83-94`, `api/src/lib/mappers.ts:525-539`.

That means ordinary status recompute will not release an errored case after data is fixed, while the dashboard implies it is part of the work queue. Decide whether `error` is recoverable Held or a terminal state requiring a dedicated recovery action.

### 6. Identity Evaluation Omits Case Reference

`StatusEvaluationInput` documents identity as work provider, VRM, case reference, or claimant: `packages/domain/src/contracts/case-status.ts:107-113`.

The API recompute only checks VRM, provider, and claimant: `api/src/functions/internal.ts:123-132`. The case reference column exists and is inserted from inbound mail: `migration/assets/schema/050_case.sql:20`, `api/src/functions/internal.ts:355-377`.

Resolution: expose/use `case_ref` in status evaluation so dashboard queue placement is not wrong for cases whose only early identity is provider reference.

### 7. Image Readiness Can Never Pass From Raw Intake Alone

EVA image rules require at least two accepted images, one overview with visible registration, and one damage closeup: `packages/domain/src/contracts/image-rules.ts:8-16`.

Email evidence inserts only file kind, content type, size, blob path, and source label: `api/src/functions/internal.ts:600-611`. It does not set image role or registration visibility. Mapper defaults missing role to `unknown` and missing registration visibility to false: `api/src/lib/mappers.ts:243-256`.

This affects dashboard logic because cases can remain stuck in Not ready until image metadata is updated by staff or an image-analysis path.

### 8. The REST `now` Contract Is Dropped

API supports `?now=` through `nowParam`: `api/src/functions/dashboard.ts:48-53`.

The domain data interface accepts `now?: Date`: `packages/domain/src/dto/index.ts:298-303`.

`useDashboard` creates a `now` value, but `rest-client.ts` ignores the argument and calls bare endpoints: `mockup-app/src/data/hooks.ts:114-120`, `mockup-app/src/data/rest-client.ts:147-159`.

Resolution: either pass `now` through for deterministic tests and time-window consistency, or remove it from the public seam and define server-time behavior.

### 9. Test Coverage Is Missing

The test worker found no tests for:

- `statusToQueue`
- `statusToStage`
- `filterQueue`
- `queueCounts`
- `pipelineStages`
- `liveCounts`
- `throughput`
- `agingExceptions`

Root `npm test` does not include the API workspace, while `api/package.json` has its own test script. Add a pure aggregate test module first, then route-level tests with DB/auth mocked.

## Files Affected By A Fix

- `api/src/functions/dashboard.ts` - aggregate implementation and possibly a new single summary endpoint.
- `api/src/functions/inbound.ts` - inbound active/default counts for the dashboard summary.
- `api/src/functions/cases.ts` - queue route filters, status recompute, action reason/due updates.
- `api/src/functions/internal.ts` - intake/status/evidence updates that feed dashboard facts.
- `api/src/lib/mappers.ts` - queue filtering and row adaptation.
- `packages/domain/src/model/queues.ts` - canonical queue/stage taxonomy.
- `packages/domain/src/contracts/case-status.ts` - terminal/recoverable status and identity semantics.
- `packages/domain/src/dto/index.ts` - dashboard summary contract and `now` semantics.
- `mockup-app/src/data/hooks.ts` - fetch bundle behavior and partial failure handling.
- `mockup-app/src/data/rest-client.ts` - `now` query support and new summary route.
- `mockup-app/src/screens/Dashboard.tsx` - combined inbox/intake dashboard UI.
- `mockup-app/src/screens/Inbox.tsx` - active/default triage semantics that feed dashboard counts.
- `mockup-app/src/components/Skeletons.tsx` - dashboard skeleton currently lags the rendered layout.
- `api/src` vs `api/dist` / `deploy/api/main.cjs` - source/live route parity.

## Recommended Resolution Shape

1. Write the dashboard acceptance contract before code:
   - which counts are stage counts;
   - which counts are queue counts;
   - which counts are windowed;
   - what "active" inbound e-mail means;
   - what "needs action" means.
2. Reconcile API source with live/deployed route surface.
3. Add a single dashboard summary endpoint:
   - case stage counts;
   - queue counts;
   - inbound active counts;
   - throughput windows;
   - oldest actionable rows;
   - reason facets.
4. Push aggregate work closer to SQL or a compact service layer so four dashboard cards do not each full-scan all cases.
5. Define and maintain action reason/due date consistently.
6. Decide whether `error` is recoverable Held or terminal.
7. Add tests around queue/stage mapping, terminal cases, on-hold override, action reasons, time windows, and inbound active/dismissed behavior.

## UI Copy Notes

If the inbound summary moves onto the dashboard, keep rendered strings from the handler side. Avoid terms like classifier, subtype, flow, schema, API, endpoint, and other process/implementation wording. Use labels like "New work emails", "Queries", "Other email", "Needs sorting", "Open email", and "View case".
