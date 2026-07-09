# Changes — TKT-116: Paginate the case queues at 15 per page (same as the inbox)

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch on `feat/ui-wave`). Client-side only —
the TKT-098 inbox pattern reused verbatim; no Data API change (the queue seam already returns the
whole list).

## What was built

**Edited — `mockup-app/src/screens/CaseList.tsx`**:
- Reuses the TKT-098 helpers **unchanged**: `pageWindow`/`slicePage`/`clampPage` from
  `src/screens/inbox-pagination.ts` (15/page) and the generic `<Pager>` from
  `src/components/Pager.tsx` (`itemNoun="cases"`) — no new pagination code was written.
- **Per-queue page state**: `pageByQueue: Partial<Record<QueueName, number>>` — switching tabs keeps
  each queue's own page (the ticket's "switching queues does not reset unexpectedly").
- **Filter-change reset**: a `filterSignature` (search/provider/status/channel/age/reason) with a
  ref guard that distinguishes "filter changed on the SAME queue" (→ reset that queue to page 1)
  from "tab switched" (→ keep pages). A clamp effect folds a stale deep page back into range when
  the list shrinks (e.g. after a bulk release).
- The DataGrid renders `items={pageItems}`; the `<Pager>` sits under the grid, inside the loaded
  branch (never over the empty/skeleton/error states; the Pager's own guard renders null when the
  list fits one page).
- **Deliberate call**: selection + quick-peek stay **filtered-scoped (all pages)** — select-all is
  "the current view" and the BulkActionBar names an explicit count, so bulk Hold/Release/Log-chase
  across pages stays possible; the existing selection-intersection effect already deselects
  filtered-out rows. Counts consistency: the pager's `total` and the "N of M cases" text are the
  UNPAGED filtered/queue counts, so they agree with the dashboard tallies.

**New — `mockup-app/src/screens/queue-pagination.test.ts`**: pins the queue-side reuse contract —
15/page cap, slice-vs-label single-sourcing, per-queue clamp on shrink, pager total = unpaged count.

## Deploy + live proof
SPA rebuilt + deployed to `cespk-spa-dev` (env production, CSP re-verified). Live on
`/queue/not-ready` (154 cases): grid shows 15 rows, pager "1–15 of 154 cases"; Next → 15 rows,
"16–30 of 154 cases". Evidence: `evidence/live-queue-not-ready-page1.png`,
`evidence/live-queue-not-ready-page2-pager.png`.

## Remainders
- Client-side window over the loaded rows (same as the inbox) — a server-side page/limit param is
  the scale follow-up already noted on TKT-098.
