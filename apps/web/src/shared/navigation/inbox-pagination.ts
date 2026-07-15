/* ============================================================
   inbox-pagination — PURE helpers for capping the inbox list at a fixed
   page size (TKT-098). No React — Inbox.tsx (and, later, TKT-096's queue
   grids) render whatever these return; the <Pager> component is the UI.

   CLIENT-SIDE ONLY: like the mailbox facet (inbox-mailbox-filter.ts), the
   window is derived from the rows already loaded for the current view — no
   new API call. A server-side page/count param is the scale follow-up once
   the inbox routinely holds more rows than one load comfortably carries.

   The single invariant every helper preserves: the SLICE and the DISPLAYED
   "N–M of T" label are both computed from `pageWindow`, so what the grid
   shows and what the pager says can never disagree.
   ============================================================ */

/** Rows shown per page. Fixed at 15 (TKT-098's acceptance criterion). */
export const INBOX_PAGE_SIZE = 15;

/** Everything the pager UI + the row slice need for one page of `total` items. */
export interface PageWindow {
  /** Clamped current page, 1-based (always in `[1, pageCount]`). */
  page: number;
  /** Total pages — never below 1 (a page 1 exists even when `total === 0`). */
  pageCount: number;
  /** 0-based slice start (inclusive). */
  start: number;
  /** 0-based slice end (exclusive). */
  end: number;
  /** 1-based index of the first item shown; 0 when the list is empty. */
  from: number;
  /** 1-based index of the last item shown; 0 when the list is empty. */
  to: number;
  /** The unpaged item count this window was computed against. */
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Number of pages needed for `total` items — at least 1, so there is always a
 *  page to be "on" even when the list is empty. */
export function pageCount(total: number, pageSize: number = INBOX_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Coerce any `page` into a valid 1-based page for `total` items: floors it,
 *  folds NaN / 0 / negatives to page 1, and caps it at the last real page (so a
 *  stale "page 5" survives the list shrinking to 2 pages). */
export function clampPage(page: number, total: number, pageSize: number = INBOX_PAGE_SIZE): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), pageCount(total, pageSize));
}

/** The full window for `page` over `total` items. `page` is clamped first, so
 *  callers may pass an out-of-range page (e.g. after the list shrank) and still
 *  get a coherent window. `from`/`to` are 0 when the list is empty. */
export function pageWindow(
  total: number,
  page: number,
  pageSize: number = INBOX_PAGE_SIZE,
): PageWindow {
  const pages = pageCount(total, pageSize);
  const clamped = clampPage(page, total, pageSize);
  const start = (clamped - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return {
    page: clamped,
    pageCount: pages,
    start,
    end,
    from: total === 0 ? 0 : start + 1,
    to: end,
    total,
    hasPrev: clamped > 1,
    hasNext: clamped < pages,
  };
}

/** The slice of `items` on `page` — computed through {@link pageWindow} so the
 *  visible rows and the pager's "N–M of T" label are drawn from one source and
 *  never disagree. Never returns more than `pageSize` items. */
export function slicePage<T>(
  items: readonly T[],
  page: number,
  pageSize: number = INBOX_PAGE_SIZE,
): T[] {
  const win = pageWindow(items.length, page, pageSize);
  return items.slice(win.start, win.end);
}

/** The 1-based page a 0-based item `index` falls on — used to follow keyboard
 *  focus onto whichever page slice now holds the next row after a dismiss. */
export function pageOf(index: number, pageSize: number = INBOX_PAGE_SIZE): number {
  return Math.floor(index / pageSize) + 1;
}
