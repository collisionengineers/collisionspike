# Changes — TKT-122: Align the dashboard containers (Inbox vs "Check the flagged details")

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch).

## Root cause (measured on the live SPA before the fix)
The needs-action column rendered its facet-chip container whenever `aging.rows.length > 0` — even
when all three chip counts (past-due / duplicate / conflict) were ZERO. The empty div is
zero-height but still occupies a flex-gap slot in the `region` column (12px), so the left column's
first content row started at y=380 while the right rail's Inbox tiles started at y=368 — the
operator's "Inbox and 'Check the flagged details' not lining up fully". (Headings were already
aligned at y=336; only the first content blocks disagreed.)

## What was built
**`apps/web/src/features/dashboard/Dashboard.tsx`**: the facet-chip row now renders ONLY when at least one
chip will actually show (`pastDueCount || duplicateCount || conflictCount`). No grid/layout changes
were needed — the cockpit grid itself was sound.

## Deploy + live proof
Re-measured live after deploy: both columns' first content blocks at y=368 (was 380 vs 368).
Before/after at 1600px: `evidence/before-dashboard-1600.png`, `evidence/after-dashboard-1600.png`.

## Remainders
None. (When any facet chip is present the row renders as before, above the group list.)
