# Changes — TKT-098: Inbox pagination (15/page)

## Status
Code-complete on branch `feat/tkt-098-inbox-pagination` (isolated worktree). Client-side only — no
Data API / seam change (the inbox seam already returns the whole list; `GET /api/inbound` has no
`limit`/`offset`).

## What was built

**New — `apps/web/src/shared/navigation/inbox-pagination.ts`** (pure, framework-free, unit-tested — mirrors the
`inbox-mailbox-filter.ts` convention): `INBOX_PAGE_SIZE = 15`, `pageCount`, `clampPage`, `pageWindow`
(clamped page + `start/end/from/to/hasPrev/hasNext`), `slicePage<T>` (derives its window from
`pageWindow` so the shown rows and the "N–M of T" label can never disagree), and `pageOf`.

**New — `apps/web/src/shared/navigation/inbox-pagination.test.ts`**: Vitest cases for the page-count /
clamp / window boundaries (empty, <15, exactly 15, 16, over-range clamp, mid-list) + `slicePage` /
`pageOf`.

**New — `apps/web/src/shared/ui/Pager.tsx`**: a generic, purely-presentational pager (parent owns
the page — no internal state) so TKT-096's second list can reuse it. First / Prev / Next / Last
`subtle` icon buttons + an en-dash "N–M of T {noun}" range. Renders **nothing** when `pageCount <= 1`
(no clutter under a short list). a11y: `nav[aria-label]`, range as `role="status" aria-live="polite"`,
per-button `aria-label`s, disabled bounds out of the tab order, and **boundary-focus handoff** — when
the activated button disables at an edge (e.g. Next onto the last page) focus moves to the still-enabled
sibling instead of dropping to `<body>`.

**Edited — `apps/web/src/features/inbox/Inbox.tsx`**:
- `page` state; `win = pageWindow(filtered.length, page)` + `pageItems = slicePage(filtered, page)`
  after the `filtered` memo; the DataGrid now renders `items={pageItems}` (the ONLY switch to the paged
  view — `setTriage` next-row math, `linkedIdsRef`, the empty-state guard, and the "All (N)" badge all
  still read the unpaged `filtered`/`preMailboxFiltered`).
- **Page reset (caveat 1):** a filter-signature effect resets to page 1 on search / e-mail-type /
  show-dismissed / mailbox-chip change but NOT on a dismiss (`pendingHidden` excluded); a separate
  `clampPage` effect keyed on `filtered.length` keeps the page valid when the list shrinks (never a
  blank page).
- **Cross-slice focus follow (caveat 2):** the focus-restore effect turns to the next row's page when
  it lives on another slice (keeps the ref, re-runs after the page change), and reserves the search-box
  fallback for the explicit sentinel or a row genuinely gone from a settled list (keeps the ref while a
  reload is in flight).
- **Peek Prev/Next (caveat 3):** left spanning the whole filtered set (not the visible page) — no change.

### Pre-existing bug fixed in passing (needed for caveat 2)
`setTriage` computed its next-row target from `filtered`, but `setTriage` is captured in the **memoized
`columns`** (deps deliberately exclude it for perf), so its `filtered` closure could be stale (empty,
from the pre-data-load render) until a columns rebuild — making the post-dismiss focus jump to the search
box. Fixed with a stable `filteredRef` (`filteredRef.current = filtered`) that `setTriage` reads, so the
next-row / focus-page-hop target is correct regardless of columns-memo staleness. Confirmed via
instrumented browser repro (stale `filtered=[]` → after fix, focus lands on the correct next row).

## Verification
See [verification.md](./verification.md). Offline gates green (293 Vitest tests, `tsc -b` + `vite build`);
functional acceptance + a11y driven in a real browser against a mock-seeded (42-row) harness.
