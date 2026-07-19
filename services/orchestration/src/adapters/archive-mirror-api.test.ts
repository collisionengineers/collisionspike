import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveMirrorApi } from './archive-mirror-api.js';

const saved = {
  url: process.env.DATA_API_URL,
  token: process.env.DATA_API_TOKEN,
};

beforeEach(() => {
  process.env.DATA_API_URL = 'https://data.example.test/';
  process.env.DATA_API_TOKEN = 'local-token';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  if (saved.url === undefined) delete process.env.DATA_API_URL;
  else process.env.DATA_API_URL = saved.url;
  if (saved.token === undefined) delete process.env.DATA_API_TOKEN;
  else process.env.DATA_API_TOKEN = saved.token;
  vi.unstubAllGlobals();
});

describe('archiveMirrorApi', () => {
  it('lists pending rows with service authentication', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

    await archiveMirrorApi.pending(25);

    expect(fetch).toHaveBeenCalledWith(
      'https://data.example.test/api/internal/archive-mirror-outbox/pending?limit=25',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer local-token' }),
      }),
    );
  });

  it('carries the exact observed generation to the row completion route', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify({ completed: true, pending: true }),
      { status: 200 },
    ));

    const result = await archiveMirrorApi.complete('evidence/a', 7);

    expect(result).toEqual({ completed: true, pending: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://data.example.test/api/internal/archive-mirror-outbox/evidence%2Fa/complete',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ generation: 7 }) }),
    );
  });

  it('surfaces a 409 as a PLAIN Error, never a typed conflict (bare contract preserved)', async () => {
    // internalArchiveMirrorOutboxComplete really can 409; it must stay a plain Error so the
    // richest wrapper's typed ConflictError semantics are not silently applied here.
    vi.mocked(fetch).mockResolvedValue(new Response('conflict', { status: 409 }));

    const error = await archiveMirrorApi.complete('evidence/a', 7).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor).toBe(Error); // exactly Error, not a subclass
    expect((error as Error).message).toBe(
      'data-api POST /api/internal/archive-mirror-outbox/evidence%2Fa/complete -> 409: conflict',
    );
  });

  it('defers the exact observed generation with its retry reason', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify({ deferred: true, pending: true }),
      { status: 200 },
    ));

    await archiveMirrorApi.defer('evidence/a', 7, 'no_folder');

    expect(fetch).toHaveBeenCalledWith(
      'https://data.example.test/api/internal/archive-mirror-outbox/evidence%2Fa/defer',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ generation: 7, reason: 'no_folder' }),
      }),
    );
  });
});
