/**
 * boxArchive size-based transport selection (TKT-142) — a file above the inline cap must
 * ride as `{ filename, blobPath, contentType }` (the facade fetches + streams the blob
 * itself) and must NEVER be downloaded into the orchestration; a file at/below the cap
 * keeps today's inline base64 path byte-for-byte.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  boxInlineUploadMaxBytes,
  uploadArchiveItem,
  type ArchiveUploadDeps,
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
