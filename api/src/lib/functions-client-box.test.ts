import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FunctionCallError,
  callBoxCopyFileRequest,
  callBoxGetFileRequest,
  callBoxReactivateFileRequest,
  verifyBoxWriteScope,
  deleteBoxFile,
  validateBoxFileDeletion,
} from './functions-client.js';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-13T12:00:00Z'));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('BOX_FN_URL', 'https://box-facade.example');
  vi.stubEnv('BOX_FN_KEY', 'test-function-key');
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
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
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-functions-key': 'test-function-key',
        },
        body: JSON.stringify({
          folder: { id: 'folder-1' },
          status: 'active',
          expires_at: '2026-08-12T12:00:00.000Z',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('reads and reactivates only through the expected-folder facade contract', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: '9001' }) });
    await callBoxGetFileRequest('9001', 'folder/1');
    await callBoxReactivateFileRequest('9001', 'folder/1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://box-facade.example/api/box/file-requests/9001?folderId=folder%2F1',
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({
        status: 'active',
        expires_at: '2026-08-12T12:00:00.000Z',
      }),
    });
  });

  it('carries dependency status without leaking its response body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'customer-name and upstream details',
    });
    const error = await callBoxGetFileRequest('9001', 'folder-1').catch((value) => value);
    expect(error).toBeInstanceOf(FunctionCallError);
    expect(error.status).toBe(503);
    expect(error.message).not.toContain('customer-name');
  });

  it('refuses an unconfigured facade before transport', async () => {
    vi.stubEnv('BOX_FN_KEY', '');
    await expect(callBoxCopyFileRequest('template-1', 'folder-1')).rejects.toThrow(
      'BOX_FN_URL/BOX_FN_KEY not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('verifyBoxWriteScope', () => {
  it('asks the facade to attest the candidate folder without trusting a caller-supplied root', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ writable: true, rootId: '392761581105' }),
    });

    await expect(verifyBoxWriteScope('folder/one')).resolves.toEqual({
      writable: true,
      rootId: '392761581105',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://box-facade.example/api/box/scope/write-check',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ folderId: 'folder/one' }),
      }),
    );
  });
});

describe('TKT-160 Box file deletion facade', () => {
  it('validates then deletes through the exact expected-folder contract', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'file/1', status: 'present' }) });
    await validateBoxFileDeletion('file/1', 'folder/1');
    await deleteBoxFile('file/1', 'folder/1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://box-facade.example/api/box/files/file%2F1?folderId=folder%2F1',
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });

  it('preserves a scope rejection status for the caller to fail before deletion', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'private details' });
    const error = await validateBoxFileDeletion('file-1', 'folder-1').catch((value) => value);
    expect(error).toBeInstanceOf(FunctionCallError);
    expect(error.status).toBe(400);
    expect(error.message).not.toContain('private details');
  });
});
