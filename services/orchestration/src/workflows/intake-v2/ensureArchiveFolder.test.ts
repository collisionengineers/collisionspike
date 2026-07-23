import { beforeEach, describe, expect, it, vi } from 'vitest';

const PINNED_ROOT = '392761581105';

const activities = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('durable-functions', () => ({
  app: { activity: (name: string, options: Record<string, unknown>) => activities.set(name, options) },
}));

const boxMock = vi.hoisted(() => ({
  getFolder: vi.fn(async (folderId: string) => ({ id: folderId, name: 'root' })),
  createFolder: vi.fn(async (name: string, _parentId: string): Promise<{
    id: string;
    name: string;
    outcome: 'created' | 'reused';
  }> => ({
    id: `folder-${name}`,
    name,
    outcome: 'created',
  })),
}));
vi.mock('../../adapters/functions-client.js', () => ({ box: boxMock }));

const { ensureArchiveFolderV2Core } = await import('./ensureArchiveFolder.js');

beforeEach(() => {
  boxMock.getFolder.mockClear();
  boxMock.createFolder.mockClear();
});

describe('ensureArchiveFolderV2Core — default (real Box facade) adapter', () => {
  it('creates the folder under the pinned root by default, via the box facade', async () => {
    const result = await ensureArchiveFolderV2Core({ name: 'QDOS26031' });
    expect(boxMock.getFolder).toHaveBeenCalledWith(PINNED_ROOT);
    expect(boxMock.createFolder).toHaveBeenCalledWith('QDOS26031', PINNED_ROOT);
    expect(result).toMatchObject({ id: 'folder-QDOS26031', name: 'QDOS26031', outcome: 'created' });
  });

  it('refuses a non-pinned parentFolderId before any Box call', async () => {
    await expect(
      ensureArchiveFolderV2Core({ name: 'QDOS26031', parentFolderId: 'some-other-folder' }),
    ).rejects.toThrow('refusing to create/find folder');
    expect(boxMock.getFolder).not.toHaveBeenCalled();
    expect(boxMock.createFolder).not.toHaveBeenCalled();
  });

  it('rejects an empty name before any Box call', async () => {
    await expect(ensureArchiveFolderV2Core({ name: '' })).rejects.toThrow('name is required');
    expect(boxMock.createFolder).not.toHaveBeenCalled();
  });

  it('surfaces the facade\'s created/reused outcome unchanged (409 exact-name reuse)', async () => {
    boxMock.createFolder.mockResolvedValueOnce({ id: 'folder-existing', name: 'QDOS26031', outcome: 'reused' });
    const result = await ensureArchiveFolderV2Core({ name: 'QDOS26031' });
    expect(result).toMatchObject({ id: 'folder-existing', outcome: 'reused' });
  });
});

describe('ensureArchiveFolderV2Core — injected fake client', () => {
  it('never touches the real Box facade when a fake client is injected', async () => {
    const fakeClient = {
      getFolder: vi.fn(async (id: string) => ({ id, name: 'root' })),
      createFolder: vi.fn(async (_parentId: string, name: string) => ({ id: 'fake-folder', name })),
    };
    const result = await ensureArchiveFolderV2Core({ name: 'QDOS26099' }, fakeClient);
    expect(result).toMatchObject({ id: 'fake-folder', name: 'QDOS26099' });
    expect(fakeClient.createFolder).toHaveBeenCalledWith(PINNED_ROOT, 'QDOS26099');
    expect(boxMock.getFolder).not.toHaveBeenCalled();
    expect(boxMock.createFolder).not.toHaveBeenCalled();
  });
});

describe('ensureArchiveFolderV2 activity registration', () => {
  it('registers the durable activity and delegates to the core function', async () => {
    expect(activities.has('ensureArchiveFolderV2')).toBe(true);
    const handler = activities.get('ensureArchiveFolderV2')!.handler as (
      input: { name: string },
      ctx: { log: (message: string) => void },
    ) => Promise<{ id: string }>;
    const ctx = { log: vi.fn() };
    const result = await handler({ name: 'QDOS26031' }, ctx);
    expect(result.id).toBe('folder-QDOS26031');
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('ensureArchiveFolderV2'));
  });
});
