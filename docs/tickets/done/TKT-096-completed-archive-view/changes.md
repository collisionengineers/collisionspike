# Changes — TKT-096: Completed/Archive view + dashboard drill-through + search fold-in

## Status
Built (2026-07-09, PLAN-003 lifecycle wave) — code-complete on `feat/lifecycle-wave`;
deploy + live proof pending. Depends on TKT-094's `done` status (same wave).

## Commits
- (uncommitted on `feat/lifecycle-wave` — the dispatching loop owns commits)

## API
- `services/data-api/src/features/cases/` — NEW `GET /api/completed/cases` (`completedCases`,
  `withRole('CollisionSpike.User')`): `status_code = ANY(eva_submitted, done, box_synced)`,
  `ORDER BY submitted_at DESC NULLS LAST, updated_at DESC`, optional `?status=<name>` filter +
  `?limit/?offset` (default 200, cap 500). `removed` deliberately excluded (PII anonymised);
  `error` stays in the Held queue. Route deliberately outside `cases/*` so it can never collide
  with `cases/{id}`.

## SPA
- NEW screen `apps/web/src/features/cases/CompletedList.tsx` — the Completed/Archive area:
  TabList **All / Awaiting delivery (`eva_submitted`) / Delivered (`done`)** with counts,
  Fluent v9 DataGrid (Case/PO mono · VRM plate · Claimant · Provider · StatusBadge · Submitted),
  row click → `/case/{id}`; skeleton/error/empty states via the shared components.
- `apps/web/src/app/routes.tsx` — `/completed` route.
- `apps/web/src/shared/ui/AppShell.tsx` — a **Completed** nav section OUTSIDE the Queues
  group (work-queues stay work-only; ADR-0023 amends ADR-0008's "no home for terminals").
- `apps/web/src/features/dashboard/Dashboard.tsx` — `STAGE_ROUTE.submitted = '/completed'`; the
  throughput tiles are now real buttons: **Submitted today / Cleared this week / Sent to EVA
  (all time)** drill through to `/completed` ("In today" stays a plain stat — arrivals live in
  the queues).
- Seam: `completedCases(status?)` on `rest-client.ts` (safe()-empty — a browse surface), mock
  source resolves empty; `useCompletedCases()` hook exported from `data/index.ts`.

## Search fold-in (TKT-072 scope decision baked in)
- `services/data-api/src/features/cases/search-route.ts` — the `case_` arm now **excludes `removed`**
  (`AND c.status_code <> $n`; PII anonymised rows must never resurface) and returns a new
  `status` field per hit (raw status name). Terminals were already included (no exclusion
  existed); the decision is now explicit + documented in the code.
- `apps/web/src/features/cases/SearchResults.tsx` — result rows render a real `StatusBadge` from
  the hit's required `status`; `SearchCaseHit.status` is part of the client interface.
- The `GLOBAL_SEARCH_ENABLED` gate stays DARK — this wires the scope so it is correct at flip
  time (per the wave instructions).

## Offline gates (2026-07-09)
- `@cs/api` vitest 335 passed + `tsc -b` clean; `@cs/web` vitest 331 passed + `vite build`
  clean (chunk-size warning pre-existing).

## Remaining (deploy phase, dispatcher-owned)
- Deploy api + SPA (after the TKT-094 DDL delta); live proof per verification.md.
- The operator re-affirmation (2026-07-08, evidence/operator-note-2026-07-08.md) is satisfied
  by this build once live.

## Deploy record — 2026-07-09
api deployed (94 functions — includes `completedCases`; 401 unauthenticated smoke passed) and SPA
deployed (200 + strict CSP re-verified). Live browse/drill-through proof awaits a staff session +
a case reaching `eva_submitted`/`done`.
