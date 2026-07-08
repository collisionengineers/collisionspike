import { describe, it, expect } from 'vitest';
import {
  INBOX_PAGE_SIZE,
  pageCount,
  clampPage,
  pageWindow,
  slicePage,
  pageOf,
} from './inbox-pagination';

/* ============================================================
   inbox-pagination — the inbox list's fixed-size pager helpers (TKT-098).
   ============================================================ */

describe('INBOX_PAGE_SIZE', () => {
  it('caps the inbox list at 15 rows per page', () => {
    expect(INBOX_PAGE_SIZE).toBe(15);
  });
});

describe('pageCount', () => {
  it('is at least 1 even for an empty list', () => {
    expect(pageCount(0)).toBe(1);
  });

  it('is 1 for anything up to a full page', () => {
    expect(pageCount(1)).toBe(1);
    expect(pageCount(14)).toBe(1);
    expect(pageCount(15)).toBe(1);
  });

  it('rolls to the next page one item past the boundary', () => {
    expect(pageCount(16)).toBe(2);
    expect(pageCount(30)).toBe(2);
    expect(pageCount(31)).toBe(3);
  });
});

describe('clampPage', () => {
  it('folds page 0, negatives and NaN to page 1', () => {
    expect(clampPage(0, 100)).toBe(1);
    expect(clampPage(-5, 100)).toBe(1);
    expect(clampPage(Number.NaN, 100)).toBe(1);
  });

  it('page 1 of an empty list is 1', () => {
    expect(clampPage(1, 0)).toBe(1);
  });

  it('keeps an in-range page and caps an over-range one at the last page', () => {
    expect(clampPage(2, 16)).toBe(2); // 16 items → 2 pages
    expect(clampPage(99, 16)).toBe(2);
  });
});

describe('pageWindow', () => {
  it('empty list: a single page 1 with a zeroed range', () => {
    expect(pageWindow(0, 1)).toEqual({
      page: 1,
      pageCount: 1,
      start: 0,
      end: 0,
      from: 0,
      to: 0,
      total: 0,
      hasPrev: false,
      hasNext: false,
    });
  });

  it('under a full page: one page, no next', () => {
    const win = pageWindow(10, 1);
    expect(win.start).toBe(0);
    expect(win.end).toBe(10);
    expect(win.from).toBe(1);
    expect(win.to).toBe(10);
    expect(win.pageCount).toBe(1);
    expect(win.hasNext).toBe(false);
  });

  it('exactly a full page: no phantom page 2', () => {
    const win = pageWindow(15, 1);
    expect(win.from).toBe(1);
    expect(win.to).toBe(15);
    expect(win.pageCount).toBe(1);
    expect(win.hasNext).toBe(false);
  });

  it('one past a full page: page 1 has a next, page 2 holds the remainder', () => {
    const page1 = pageWindow(16, 1);
    expect(page1.from).toBe(1);
    expect(page1.to).toBe(15);
    expect(page1.hasNext).toBe(true);

    const page2 = pageWindow(16, 2);
    expect(page2.start).toBe(15);
    expect(page2.end).toBe(16);
    expect(page2.from).toBe(16);
    expect(page2.to).toBe(16);
    expect(page2.hasPrev).toBe(true);
    expect(page2.hasNext).toBe(false);
  });

  it('clamps a stale page after the list shrinks below it', () => {
    const win = pageWindow(15, 2); // was on page 2, list is now one page
    expect(win.page).toBe(1);
    expect(win.from).toBe(1);
    expect(win.to).toBe(15);
    expect(win.hasPrev).toBe(false);
  });

  it('mid-list page: bounded window with both neighbours', () => {
    const win = pageWindow(40, 2);
    expect(win.start).toBe(15);
    expect(win.end).toBe(30);
    expect(win.from).toBe(16);
    expect(win.to).toBe(30);
    expect(win.hasPrev).toBe(true);
    expect(win.hasNext).toBe(true);
  });
});

describe('slicePage', () => {
  const items = Array.from({ length: 40 }, (_v, i) => i); // 0..39

  it('returns the requested page window', () => {
    expect(slicePage(items, 2)).toEqual([
      15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    ]);
  });

  it('clamps an over-range page to the last window', () => {
    expect(slicePage(items, 99)).toEqual([30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
  });

  it('returns [] for an empty list', () => {
    expect(slicePage([], 1)).toEqual([]);
  });

  it('never returns more than a page of items', () => {
    expect(slicePage(items, 1).length).toBe(INBOX_PAGE_SIZE);
    expect(slicePage(items, 1).length).toBeLessThanOrEqual(INBOX_PAGE_SIZE);
  });
});

describe('pageOf', () => {
  it('maps a 0-based item index to its 1-based page', () => {
    expect(pageOf(0)).toBe(1);
    expect(pageOf(14)).toBe(1);
    expect(pageOf(15)).toBe(2);
    expect(pageOf(29)).toBe(2);
    expect(pageOf(30)).toBe(3);
  });
});
