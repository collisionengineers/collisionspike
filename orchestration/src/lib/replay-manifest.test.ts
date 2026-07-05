import { describe, it, expect } from 'vitest';
import { compareByReceived, mergeChronological, tallyByCategory } from './replay-manifest.js';

const item = (id: string, ts: string) => ({ internetMessageId: id, receivedDateTime: ts });

describe('compareByReceived', () => {
  it('orders by receivedDateTime ascending (ISO lexicographic = chronological)', () => {
    expect(compareByReceived(item('a', '2026-06-29T10:00:00Z'), item('b', '2026-06-29T11:00:00Z'))).toBe(-1);
    expect(compareByReceived(item('a', '2026-06-29T12:00:00Z'), item('b', '2026-06-29T11:00:00Z'))).toBe(1);
  });

  it('is a TOTAL order — ties on time break on internetMessageId (deterministic replay)', () => {
    const t = '2026-06-29T10:00:00Z';
    expect(compareByReceived(item('aaa', t), item('bbb', t))).toBe(-1);
    expect(compareByReceived(item('bbb', t), item('aaa', t))).toBe(1);
    expect(compareByReceived(item('same', t), item('same', t))).toBe(0);
  });
});

describe('mergeChronological', () => {
  it('interleaves three mailbox streams into one global chronological sequence', () => {
    // Instruction (info@, 09:00) must precede its reply (engineers@, 12:00) across mailboxes.
    const info = [item('instr', '2026-06-29T09:00:00Z'), item('info2', '2026-06-29T15:00:00Z')];
    const engineers = [item('reply', '2026-06-29T12:00:00Z')];
    const desk = [item('desk1', '2026-06-29T06:00:00Z'), item('desk2', '2026-06-29T18:00:00Z')];
    const merged = mergeChronological([info, engineers, desk]);
    expect(merged.map((m) => m.internetMessageId)).toEqual(['desk1', 'instr', 'reply', 'info2', 'desk2']);
  });

  it('is stable and total across identical timestamps in different mailboxes', () => {
    const t = '2026-06-29T10:00:00Z';
    const a = [item('m-a', t)];
    const b = [item('m-b', t)];
    const merged = mergeChronological([b, a]); // input order b-first
    expect(merged.map((m) => m.internetMessageId)).toEqual(['m-a', 'm-b']); // tie-break wins over input order
  });

  it('handles empty mailbox lists', () => {
    expect(mergeChronological([[], [], []])).toEqual([]);
    expect(mergeChronological([[item('only', '2026-06-29T10:00:00Z')], []])).toHaveLength(1);
  });
});

describe('tallyByCategory', () => {
  it('counts rows by category/subtype', () => {
    const rows = [
      { category: 'receiving_work', subtype: 'new_client_work' },
      { category: 'receiving_work', subtype: 'new_client_work' },
      { category: 'billing', subtype: 'billing_request' },
      { category: 'query', subtype: 'query_existing_work' },
    ];
    expect(tallyByCategory(rows)).toEqual({
      'receiving_work/new_client_work': 2,
      'billing/billing_request': 1,
      'query/query_existing_work': 1,
    });
  });

  it('returns an empty object for no rows', () => {
    expect(tallyByCategory([])).toEqual({});
  });
});
