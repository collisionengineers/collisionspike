# Verification — TKT-096: Completed/Archive view + dashboard drill-through + search fold-in

## Verdict
PENDING — code-complete + offline-gated (2026-07-09); awaiting api + SPA deploy and the live
browse/drill-through/search proof (which itself needs a case reaching `eva_submitted`/`done`
via TKT-094/095).

## Evidence (offline, 2026-07-09)
- `@cs/api` vitest 335 passed + `tsc -b` clean (`GET /api/completed/cases`; search.ts `removed`
  exclusion + `status` field).
- `mockup-app` vitest 331 passed + `vite build` clean (`/completed` route, CompletedList screen,
  Completed nav section outside Queues, clickable throughput tiles, SearchResults StatusBadge).

## Pending / gaps
1. Deploy api + SPA (after the TKT-094 DDL delta).
2. Live: `/completed` lists `eva_submitted`/`done`/`box_synced` with the Awaiting-delivery vs
   Delivered split; the three work-queues + counts unchanged; dashboard tiles drill through.
3. Search: the GLOBAL_SEARCH gate is still DARK by design — scope proof (returns a delivered
   case, hides `removed`) lands whenever the gate is flipped; until then the scope is
   code-reviewed only.

## How to re-verify
- `GET /api/completed/cases` with a staff token → rows ordered submitted_at DESC; `?status=done`
  filters.
- SPA: nav "Completed cases" → tabs render counts; click a Submitted-today tile → /completed.
- Search (post-flip): search a delivered case's VRM → hit with a Done badge; search a removed
  case's identifier → no hit.
