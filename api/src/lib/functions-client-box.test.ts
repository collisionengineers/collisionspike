import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callBoxCopyFileRequest } from './functions-client.js';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('BOX_FN_URL', 'https://box-facade.example');
  vi.stubEnv('BOX_FN_KEY', 'test-function-key');
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('callBoxCopyFileRequest', () => {
  it('calls the existing facade route with the active copy contract', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'request-1',
        url: 'https://upload.box.com/request/abc',
        status: 'active',
      }),
    });

    await expect(callBoxCopyFileRequest('template/a', 'folder-1')).resolves.toMatchObject({
      id: 'request-1',
      url: 'https://upload.box.com/request/abc',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://box-facade.example/api/box/file-requests/template%2Fa/copy',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-functions-key': 'test-function-key',
        },
        body: JSON.stringify({ folder: { id: 'folder-1' }, status: 'active' }),
      },
    );
  });

  it('refuses an unconfigured facade before transport', async () => {
    vi.stubEnv('BOX_FN_KEY', '');
    await expect(callBoxCopyFileRequest('template-1', 'folder-1')).rejects.toThrow(
      'BOX_FN_URL/BOX_FN_KEY not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
