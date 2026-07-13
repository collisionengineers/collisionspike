import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('./db.js', () => ({ query: db.query, tx: db.tx }));

import { listOutlookLinkBackfillCandidates, recordOutlookLinkBackfillResult } from './outlook-link-backfill.js';

beforeEach(() => {
  db.query.mockReset();
  db.tx.mockReset();
});

describe('Outlook link backfill ledger', () => {
  it('enumerates only unresolved mailbox-qualified rows with a bounded page', async () => {
    db.query.mockResolvedValue([{ id: 'row-1', source_mailbox: 'info@example.test', source_message_id: '<x@y>' }]);
    await expect(listOutlookLinkBackfillCandidates(500)).resolves.toEqual([{
      inboundEmailId: 'row-1', sourceMailbox: 'info@example.test', sourceMessageId: '<x@y>',
    }]);
    expect(db.query.mock.calls[0]?.[0]).toContain("l.outcome IN ('resolved','not_found','not_accessible','ambiguous','identity_conflict')");
    expect(db.query.mock.calls[0]?.[1]).toEqual([100]);
  });

  it('updates the exact source tuple and appends a resolved immutable tuple in one transaction', async () => {
    const calls: Array<[string, unknown[]?]> = [];
    const q = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes('FOR UPDATE')) return [{
        source_mailbox: 'info@example.test', source_message_id: '<x@y>',
        graph_message_id: null, outlook_web_link: null,
      }];
      return [];
    });
    db.tx.mockImplementation(async (fn: (queryFn: unknown) => unknown) => fn(q));
    await expect(recordOutlookLinkBackfillResult({
      attemptId: '00000000-0000-4000-8000-000000000001',
      inboundEmailId: 'row-1', sourceMailbox: 'info@example.test', sourceMessageId: '<x@y>',
      outcome: 'resolved', reason: 'exact_match', graphMessageId: 'AAMk-id',
      outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=AAMk-id',
    })).resolves.toEqual({ recorded: true, applied: true, outcome: 'resolved' });
    expect(calls.find(([sql]) => sql.includes('UPDATE inbound_email'))?.[1]).toEqual([
      'row-1', 'info@example.test', '<x@y>', 'AAMk-id',
      'https://outlook.office365.com/owa/?ItemID=AAMk-id',
    ]);
    expect(calls.find(([sql]) => sql.includes('INSERT INTO outlook_link_backfill_ledger'))?.[1]?.[4]).toBe('resolved');
  });

  it('does not overwrite a different immutable tuple and records the conflict', async () => {
    const calls: Array<[string, unknown[]?]> = [];
    const q = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes('FOR UPDATE')) return [{
        source_mailbox: 'info@example.test', source_message_id: '<x@y>',
        graph_message_id: 'existing',
        outlook_web_link: 'https://outlook.office365.com/owa/?ItemID=existing',
      }];
      return [];
    });
    db.tx.mockImplementation(async (fn: (queryFn: unknown) => unknown) => fn(q));
    const result = await recordOutlookLinkBackfillResult({
      attemptId: '00000000-0000-4000-8000-000000000002', inboundEmailId: 'row-1',
      sourceMailbox: 'info@example.test', sourceMessageId: '<x@y>', outcome: 'resolved',
      reason: 'exact_match', graphMessageId: 'different',
      outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=different',
    });
    expect(result).toEqual({ recorded: true, applied: false, outcome: 'identity_conflict' });
    expect(calls.some(([sql]) => sql.includes('UPDATE inbound_email'))).toBe(false);
  });
});
