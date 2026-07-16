import { describe, expect, it, vi } from 'vitest';
import type { TxQuery } from '../../platform/db/client.js';
import {
  requestArchiveMirror,
  requestArchiveMirrorIfEligible,
} from './mirror-outbox.js';

const eligible = {
  id: 'evidence-1',
  case_id: 'case-1',
  excluded: false,
  storage_path: 'staff/photo.jpg',
  box_file_id: null,
};

describe('archive mirror request strictness', () => {
  it('keeps the existing eligible wrapper tolerant when INSERT RETURNING has no row', async () => {
    const q = vi.fn(async () => []) as unknown as TxQuery;

    await expect(requestArchiveMirrorIfEligible(q, eligible)).resolves.toBeUndefined();
    expect(q).toHaveBeenCalledTimes(1);
  });

  it('keeps the staff-image durability request strict when INSERT RETURNING has no row', async () => {
    const q = vi.fn(async () => []) as unknown as TxQuery;

    await expect(requestArchiveMirror(q, eligible)).rejects.toThrow(
      'archive mirror request returned no generation',
    );
    expect(q).toHaveBeenCalledTimes(1);
  });

  it('returns the requested generation through both public paths', async () => {
    const tolerantQ = vi.fn(async () => [{ requested_generation: '4' }]) as unknown as TxQuery;
    const strictQ = vi.fn(async () => [{ requested_generation: 5 }]) as unknown as TxQuery;

    await expect(requestArchiveMirrorIfEligible(tolerantQ, eligible)).resolves.toBe(4);
    await expect(requestArchiveMirror(strictQ, eligible)).resolves.toBe(5);
  });
});
