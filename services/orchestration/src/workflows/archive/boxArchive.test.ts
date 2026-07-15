/**
 * boxArchive size-based transport selection (TKT-142) — a file above the inline cap must
 * ride as `{ filename, blobPath, contentType }` (the facade fetches + streams the blob
 * itself) and must NEVER be downloaded into the orchestration; a file at/below the cap
 * keeps today's inline base64 path byte-for-byte.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  boxInlineUploadMaxBytes,
  mirrorArchiveItems,
  uploadArchiveItem,
  type ArchiveUploadDeps,
  type ArchiveMirrorItemDeps,
} from './boxArchive.js';

const EIGHT_MIB = 8 * 1024 * 1024;

function fakeDeps(sizeBytes: number): {
  deps: ArchiveUploadDeps;
  calls: { download: ReturnType<typeof vi.fn>; inline: ReturnType<typeof vi.fn>; fromBlob: ReturnType<typeof vi.fn> };
} {
  const download = vi.fn(async () => Buffer.from('small-bytes'));
  const inline = vi.fn(async () => ({ id: 'file-inline' }));
  const fromBlob = vi.fn(async () => ({ id: 'file-blobpath' }));
  return {
    deps: {
      sizeOf: async () => sizeBytes,
      download,
      uploadInline: inline,
      uploadFromBlob: fromBlob,
    },
    calls: { download, inline, fromBlob },
  };
}

const ITEM = { filename: 'message-ab12cd34.eml', blobPath: 'msg-1/message-ab12cd34.eml', contentType: 'message/rfc822' };

describe('uploadArchiveItem — TKT-142 size-based branch selection', () => {
  it('sends a LARGE file by blob reference and never downloads it', async () => {
    const { deps, calls } = fakeDeps(17_600_000); // the stranded QDOS26029 .eml shape
    const res = await uploadArchiveItem('folder-1', ITEM, EIGHT_MIB, deps);
    expect(res.id).toBe('file-blobpath');
    expect(calls.fromBlob).toHaveBeenCalledWith('folder-1', ITEM.filename, ITEM.blobPath, ITEM.contentType);
    expect(calls.download).not.toHaveBeenCalled();
    expect(calls.inline).not.toHaveBeenCalled();
  });

  it('keeps a small file on the inline base64 path', async () => {
    const { deps, calls } = fakeDeps(120_000);
    const res = await uploadArchiveItem('folder-1', ITEM, EIGHT_MIB, deps);
    expect(res.id).toBe('file-inline');
    expect(calls.inline).toHaveBeenCalledWith(
      'folder-1',
      ITEM.filename,
      Buffer.from('small-bytes').toString('base64'),
      ITEM.contentType,
    );
    expect(calls.fromBlob).not.toHaveBeenCalled();
  });

  it('requires the programme test root again at the Box upload for agent images', async () => {
    const { deps, calls } = fakeDeps(120_000);
    await uploadArchiveItem(
      'folder-1',
      { ...ITEM, sourceLabel: 'agent_image_ingest' },
      EIGHT_MIB,
      deps,
    );
    expect(calls.inline).toHaveBeenCalledWith(
      'folder-1',
      ITEM.filename,
      Buffer.from('small-bytes').toString('base64'),
      ITEM.contentType,
      '392761581105',
    );
  });

  it('a file EXACTLY at the cap stays inline (only "exceeds" goes by blob reference)', async () => {
    const { deps, calls } = fakeDeps(EIGHT_MIB);
    await uploadArchiveItem('folder-1', ITEM, EIGHT_MIB, deps);
    expect(calls.inline).toHaveBeenCalled();
    expect(calls.fromBlob).not.toHaveBeenCalled();
  });

  it('propagates a size-probe failure (the caller\'s per-item catch isolates siblings)', async () => {
    const deps: ArchiveUploadDeps = {
      sizeOf: async () => {
        throw new Error('blob missing');
      },
      download: vi.fn(),
      uploadInline: vi.fn(),
      uploadFromBlob: vi.fn(),
    };
    await expect(uploadArchiveItem('folder-1', ITEM, EIGHT_MIB, deps)).rejects.toThrow('blob missing');
  });
});

describe('boxInlineUploadMaxBytes — env knob', () => {
  const KEY = 'BOX_INLINE_UPLOAD_MAX_BYTES';
  const saved = process.env[KEY];
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  it('defaults to 8 MiB when unset', () => {
    delete process.env[KEY];
    expect(boxInlineUploadMaxBytes()).toBe(EIGHT_MIB);
  });

  it('honours a numeric override', () => {
    process.env[KEY] = '1048576';
    expect(boxInlineUploadMaxBytes()).toBe(1_048_576);
  });

  it('falls back to the default on garbage / non-positive values', () => {
    process.env[KEY] = 'lots';
    expect(boxInlineUploadMaxBytes()).toBe(EIGHT_MIB);
    process.env[KEY] = '0';
    expect(boxInlineUploadMaxBytes()).toBe(EIGHT_MIB);
    process.env[KEY] = '-5';
    expect(boxInlineUploadMaxBytes()).toBe(EIGHT_MIB);
  });
});

describe('mirrorArchiveItems — row-specific stamping', () => {
  const rows = [
    {
      id: 'ev-1', filename: 'photo-a.jpg', blobPath: 'msg/shared.jpg', contentType: 'image/jpeg',
      claimToken: '11111111-1111-4111-8111-111111111111', decisionGeneration: 1,
    },
    {
      id: 'ev-2', filename: 'photo-b.jpg', blobPath: 'msg/shared.jpg', contentType: 'image/jpeg',
      claimToken: '22222222-2222-4222-8222-222222222222', decisionGeneration: 2,
    },
  ];

  it('uploads a shared blob once but stamps and counts every evidence row', async () => {
    const deps: ArchiveMirrorItemDeps = {
      upload: vi.fn(async () => ({ id: 'box-1' })),
      stamp: vi.fn(async () => ({ updated: true })),
    };
    const ctx = { warn: vi.fn() };

    const result = await mirrorArchiveItems('case-1', 'folder-1', rows, ctx, deps);

    expect(result).toEqual({ uploaded: 2, total: 2, fileIds: ['box-1', 'box-1'] });
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.stamp).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.stamp).mock.calls.map(([payload]) => payload.evidenceId)).toEqual([
      'ev-1', 'ev-2',
    ]);
    expect(vi.mocked(deps.stamp).mock.calls[0][0]).toMatchObject({
      claimToken: '11111111-1111-4111-8111-111111111111',
      decisionGeneration: 1,
    });
  });

  it('does not count a row whose stamp reports updated=false', async () => {
    const deps: ArchiveMirrorItemDeps = {
      upload: vi.fn(async () => ({ id: 'box-1' })),
      stamp: vi.fn()
        .mockResolvedValueOnce({ updated: true })
        .mockResolvedValueOnce({ updated: false }),
    };
    const ctx = { warn: vi.fn() };

    const result = await mirrorArchiveItems('case-1', 'folder-1', rows, ctx, deps);

    expect(result).toEqual({ uploaded: 1, total: 2, fileIds: ['box-1'] });
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('was not stamped'));
  });

  it('releases a claim when Box fails closed on an unverifiable conflict', async () => {
    const deps: ArchiveMirrorItemDeps = {
      upload: vi.fn(async () => { throw new Error('fn POST box upload → 502: identity unverifiable'); }),
      stamp: vi.fn(async () => ({ updated: true })),
      release: vi.fn(async () => ({ released: true })),
    };
    const ctx = { warn: vi.fn() };

    const result = await mirrorArchiveItems('case-1', 'folder-1', [rows[0]], ctx, deps);

    expect(result.uploaded).toBe(0);
    expect(deps.release).toHaveBeenCalledWith({
      caseId: 'case-1',
      evidenceId: 'ev-1',
      claimToken: '11111111-1111-4111-8111-111111111111',
    });
    expect(deps.stamp).not.toHaveBeenCalled();
  });
});
