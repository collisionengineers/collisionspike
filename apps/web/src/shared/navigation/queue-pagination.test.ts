import { describe, expect, it } from 'vitest';
import { INBOX_PAGE_SIZE, clampPage, pageWindow, slicePage } from './inbox-pagination';

/* TKT-116 — the case queues reuse the TKT-098 inbox pagination helpers verbatim
   (inbox-pagination.ts + the generic <Pager>). These tests pin the QUEUE-side
   contract: 15 rows per page, slice/label single-source, per-queue page clamping
   when a queue shrinks (e.g. bulk release), and dashboard-count consistency (the
   pager total is the UNPAGED filtered count, never the slice length). */

interface QueueRowLike {
  id: string;
}
const rows = (n: number): QueueRowLike[] =>
  Array.from({ length: n }, (_, i) => ({ id: `case-${i + 1}` }));

describe('queue pages are capped at 15 (the shared page size)', () => {
  it('a 40-case queue pages 15 / 15 / 10', () => {
    const queue = rows(40);
    expect(INBOX_PAGE_SIZE).toBe(15);
    expect(slicePage(queue, 1)).toHaveLength(15);
    expect(slicePage(queue, 2)).toHaveLength(15);
    expect(slicePage(queue, 3)).toHaveLength(10);
    expect(pageWindow(queue.length, 3).pageCount).toBe(3);
  });

  it('a queue that fits one page never shows more than it has', () => {
    const queue = rows(7);
    expect(slicePage(queue, 1)).toHaveLength(7);
    expect(pageWindow(queue.length, 1).pageCount).toBe(1); // <Pager> renders null
  });
});

describe('the pager label and the slice can never disagree', () => {
  it('page 2 of 40 shows rows 16–30 and says 16–30 of 40', () => {
    const queue = rows(40);
    const win = pageWindow(queue.length, 2);
    const slice = slicePage(queue, 2);
    expect(slice[0].id).toBe('case-16');
    expect(slice[slice.length - 1].id).toBe('case-30');
    expect(win.from).toBe(16);
    expect(win.to).toBe(30);
    // The TOTAL is the unpaged count — what keeps the pager consistent with the
    // dashboard queue tallies (TKT-116 acceptance).
    expect(win.total).toBe(40);
  });
});

describe('per-queue page survival (the CaseList wiring contract)', () => {
  it('a stale deep page clamps down when the queue shrinks (bulk release)', () => {
    // Reviewer was on page 3 of 40; a bulk release leaves 12 cases.
    expect(clampPage(3, 12)).toBe(1);
    // …and on a 20-case queue, page 3 folds to the last real page.
    expect(clampPage(3, 20)).toBe(2);
  });

  it('an untouched queue keeps its page (clamp is a no-op in range)', () => {
    expect(clampPage(2, 40)).toBe(2);
  });
});
