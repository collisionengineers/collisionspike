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
});
