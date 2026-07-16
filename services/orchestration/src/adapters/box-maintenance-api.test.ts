import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boxMaintenanceApi } from './box-maintenance-api.js';

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

describe('boxMaintenanceApi', () => {
  it('calls the authenticated API-owned File Request drain', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify({ processed: 2, completed: 1 }),
      { status: 200 },
    ));

    await expect(boxMaintenanceApi.drainFileRequests()).resolves.toEqual({
      processed: 2,
      completed: 1,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://data.example.test/api/internal/box-file-request-outbox/drain',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer local-token' }),
      }),
    );
  });

  it('throws on a failed drain so the Durable activity retry remains effective', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('busy', { status: 503 }));
    await expect(boxMaintenanceApi.drainFileRequests()).rejects.toThrow(/503/);
  });
});
