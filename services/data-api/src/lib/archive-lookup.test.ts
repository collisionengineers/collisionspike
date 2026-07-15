import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const listBoxFolderEntries = vi.fn<() => Promise<Array<{ id: string; name: string }>>>();
vi.mock('./functions-client.js', () => ({ listBoxFolderEntries }));

const { archiveLookup, archiveConfigured } = await import('./archive-lookup.js');

beforeEach(() => {
  listBoxFolderEntries.mockReset();
});
afterEach(() => {
  delete process.env.RETRO_BOX_ARCHIVE_ROOT_IDS;
});

describe('archiveLookup (TKT-107) — read-only, suggest-only', () => {
  it('is an honest no-op when no archive root is configured', async () => {
    delete process.env.RETRO_BOX_ARCHIVE_ROOT_IDS;
    expect(archiveConfigured()).toBe(false);
    const res = await archiveLookup('CCPY26050');
    expect(res.configured).toBe(false);
    expect(res.matches).toEqual([]);
    expect(listBoxFolderEntries).not.toHaveBeenCalled();
  });

  it('matches a Case/PO folder and mints an Open-in-Box deep link', async () => {
    process.env.RETRO_BOX_ARCHIVE_ROOT_IDS = '4077648161';
    listBoxFolderEntries.mockResolvedValue([
      { id: '11', name: 'CCPY26050' },
      { id: '22', name: 'ABCD26001' },
    ]);
    const res = await archiveLookup('CCPY 26050'); // spaced → canonical match
    expect(res.configured).toBe(true);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]).toMatchObject({
      name: 'CCPY26050',
      folderId: '11',
      openInBoxUrl: 'https://app.box.com/folder/11',
    });
  });

  it('matches a registration space-insensitively', async () => {
    process.env.RETRO_BOX_ARCHIVE_ROOT_IDS = '4077648161';
    listBoxFolderEntries.mockResolvedValue([{ id: '33', name: 'YT13UTV - claimant' }]);
    const res = await archiveLookup('yt13 utv');
    expect(res.matches.map((m) => m.folderId)).toEqual(['33']);
  });

  it('degrades to an empty (still configured) result when the facade throws', async () => {
    process.env.RETRO_BOX_ARCHIVE_ROOT_IDS = '4077648161';
    listBoxFolderEntries.mockRejectedValue(new Error('BOX_FN_URL not configured'));
    const res = await archiveLookup('CCPY26050');
    expect(res.configured).toBe(true);
    expect(res.matches).toEqual([]);
  });

  it('caps the number of matches returned', async () => {
    process.env.RETRO_BOX_ARCHIVE_ROOT_IDS = '4077648161';
    listBoxFolderEntries.mockResolvedValue(
      Array.from({ length: 20 }, (_v, i) => ({ id: String(i), name: `CCPY260${i}` })),
    );
    const res = await archiveLookup('CCPY', 8);
    expect(res.matches).toHaveLength(8);
  });
});
