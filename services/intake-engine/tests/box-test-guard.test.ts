import { describe, it, expect, vi } from 'vitest';
import { resolveArchiveRoot, ensureArchiveFolder, type BoxFolderClient } from '../src/adapters/box-test-guard.js';

const PINNED_ROOT = '392761581105'; // tools/box-scope.json's allowedRoot, confirmed in the ticket.

describe('resolveArchiveRoot', () => {
  it('returns the pinned root from tools/box-scope.json', () => {
    expect(resolveArchiveRoot()).toBe(PINNED_ROOT);
  });
});

describe('ensureArchiveFolder — THE critical negative test', () => {
  it('throws BEFORE calling the injected client when the target root is not the pinned root', async () => {
    const getFolder = vi.fn();
    const createFolder = vi.fn();
    const client: BoxFolderClient = { getFolder, createFolder };

    await expect(
      ensureArchiveFolder('QDOS26001', client, { parentFolderId: 'some-other-folder-id' }),
    ).rejects.toThrow(/pinned test root/);

    expect(getFolder).not.toHaveBeenCalled();
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('throws for folder id "0" too — never a silent allow', async () => {
    const getFolder = vi.fn();
    const createFolder = vi.fn();
    const client: BoxFolderClient = { getFolder, createFolder };

    await expect(ensureArchiveFolder('QDOS26001', client, { parentFolderId: '0' })).rejects.toThrow();
    expect(getFolder).not.toHaveBeenCalled();
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('a legitimate call to the pinned root succeeds via the injected (fake) client, no real network', async () => {
    const getFolder = vi.fn().mockResolvedValue({ id: PINNED_ROOT, name: 'root' });
    const createFolder = vi.fn().mockResolvedValue({ id: 'new-folder-id', name: 'QDOS26001' });
    const client: BoxFolderClient = { getFolder, createFolder };

    const result = await ensureArchiveFolder('QDOS26001', client);

    expect(result).toEqual({ id: 'new-folder-id', name: 'QDOS26001' });
    expect(getFolder).toHaveBeenCalledWith(PINNED_ROOT);
    expect(createFolder).toHaveBeenCalledWith(PINNED_ROOT, 'QDOS26001');
  });

  it('explicitly passing the pinned root as parentFolderId also succeeds', async () => {
    const getFolder = vi.fn().mockResolvedValue(undefined);
    const createFolder = vi.fn().mockResolvedValue({ id: 'new-folder-id', name: 'QDOS26002' });
    const client: BoxFolderClient = { getFolder, createFolder };

    const result = await ensureArchiveFolder('QDOS26002', client, { parentFolderId: PINNED_ROOT });

    expect(result).toEqual({ id: 'new-folder-id', name: 'QDOS26002' });
    expect(createFolder).toHaveBeenCalledWith(PINNED_ROOT, 'QDOS26002');
  });
});
