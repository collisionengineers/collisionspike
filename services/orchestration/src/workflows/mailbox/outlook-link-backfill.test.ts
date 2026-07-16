import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@azure/functions', () => ({ app: { http: () => {} } }));
vi.mock('../../adapters/data-api.js', () => ({
  dataApi: {
    outlookLinkBackfillCandidates: vi.fn(),
    reportOutlookLinkBackfill: vi.fn(),
  },
}));
vi.mock('../../platform/outlook-links.js', () => ({ findStoredMessageLink: vi.fn() }));

import { dataApi } from '../../adapters/data-api.js';
import { findStoredMessageLink } from '../../platform/outlook-links.js';
import { runOutlookLinkBackfill } from './outlook-link-backfill.js';

const candidates = vi.mocked(dataApi.outlookLinkBackfillCandidates);
const report = vi.mocked(dataApi.reportOutlookLinkBackfill);
const find = vi.mocked(findStoredMessageLink);
const ctx = { log: vi.fn(), warn: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  candidates.mockResolvedValue({ rows: [{
    inboundEmailId: 'row-1',
    sourceMailbox: 'info@collisionengineers.co.uk',
    sourceMessageId: '<old@example.test>',
  }] });
});

describe('runOutlookLinkBackfill', () => {
  it('records a read-only exact match with its immutable tuple', async () => {
    find.mockResolvedValue({
      status: 'resolved', graphMessageId: 'AAMk-old',
      outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=AAMk-old',
    });
    report.mockResolvedValue({ recorded: true, applied: true, outcome: 'resolved' });
    await expect(runOutlookLinkBackfill(25, ctx as never, () => 'attempt-1'))
      .resolves.toEqual({ attempted: 1, resolved: 1, unresolved: 0 });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: 'attempt-1', sourceMailbox: 'info@collisionengineers.co.uk',
      sourceMessageId: '<old@example.test>', graphMessageId: 'AAMk-old', outcome: 'resolved',
    }));
  });

  it.each(['not_found', 'not_accessible', 'ambiguous'] as const)(
    'ledgers %s without inventing a link',
    async (status) => {
      find.mockResolvedValue({ status, reason: `reason_${status}` });
      report.mockResolvedValue({ recorded: true, applied: false, outcome: status });
      await expect(runOutlookLinkBackfill(25, ctx as never, () => 'attempt-2'))
        .resolves.toEqual({ attempted: 1, resolved: 0, unresolved: 1 });
      expect(report).toHaveBeenCalledWith(expect.not.objectContaining({ graphMessageId: expect.anything() }));
    },
  );
});
