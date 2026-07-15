import { describe, expect, it } from 'vitest';
import { decideArchiveHoldingOwner, decideArchiveHoldingTransfer } from './archive-holding.js';

describe('archive holding decisions', () => {
  it('only adopts an exactly-one active case with a Case/PO', () => {
    expect(decideArchiveHoldingOwner([])).toEqual({ kind: 'none' });
    expect(decideArchiveHoldingOwner([{ caseId: 'a', casePo: 'QDOS26001' }])).toEqual({
      kind: 'exact', candidate: { caseId: 'a', casePo: 'QDOS26001' },
    });
    expect(decideArchiveHoldingOwner([{ caseId: 'a', casePo: null }]).kind).toBe('ambiguous');
    expect(decideArchiveHoldingOwner([
      { caseId: 'a', casePo: 'QDOS26001' }, { caseId: 'b', casePo: 'QDOS26002' },
    ]).kind).toBe('ambiguous');
  });

  it('deduplicates by bytes and disambiguates same-name different bytes', () => {
    const entries = [{ id: 'existing', name: 'front.jpg', type: 'file', sha1: 'abc' }];
    expect(decideArchiveHoldingTransfer('other.jpg', 'ABC', 'f'.repeat(64), entries)).toEqual({
      kind: 'deduplicate', existingFileId: 'existing',
    });
    expect(decideArchiveHoldingTransfer('front.jpg', 'def', '12345678'.padEnd(64, '0'), entries)).toEqual({
      kind: 'move', name: 'front-12345678.jpg',
    });
  });
});
