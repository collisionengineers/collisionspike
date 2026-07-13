import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpCaptureApi } from './httpCaptureApi';

const authorization = {
  sessionId: 'session/one',
  accessToken: 'short-lived-secret',
  accessTokenExpiresAt: '2026-07-13T12:00:00.000Z'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('HttpCaptureApi', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exchanges the bootstrap secret without putting it in the URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      sessionId: 'session-1',
      accessToken: 'access',
      accessTokenExpiresAt: '2026-07-13T12:00:00.000Z'
    }));

    await new HttpCaptureApi().exchange('bootstrap-secret');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/public/capture/exchange');
    expect(String(init?.body)).toContain('bootstrap-secret');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('uses the session route and bearer token for manifest requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
    await new HttpCaptureApi().getManifest(authorization);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/public/capture/sessions/session%2Fone');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer short-lived-secret');
    expect(init?.cache).toBe('no-store');
  });

  it('keeps API authorization away from the direct Blob upload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 201 }));
    await new HttpCaptureApi().uploadFile({
      uploadId: 'upload-1',
      assetId: 'asset-1',
      method: 'direct',
      uploadUrl: 'https://storage.example.test/object?sas=redacted',
      headers: { 'x-ms-blob-type': 'BlockBlob' },
      expiresAt: '2026-07-13T12:00:00.000Z'
    }, new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }));

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('x-ms-blob-type')).toBe('BlockBlob');
    expect(headers.has('Authorization')).toBe(false);
    expect(init?.credentials).toBe('omit');
  });

  it('sends a stable idempotency key when creating an upload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
    await new HttpCaptureApi().createUpload(authorization, {
      shotId: 'overview',
      idempotencyKey: 'attempt-1',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 5,
      sha256: 'abc123'
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/public/capture/sessions/session%2Fone/uploads');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('attempt-1');
  });

  it('maps stable API problems without echoing request secrets', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      error: 'capture_expired',
      message: 'This link expired.'
    }, 410));

    await expect(new HttpCaptureApi().getManifest(authorization)).rejects.toMatchObject({
      code: 'capture_expired',
      retryable: false,
      message: 'This link expired.'
    });
  });
});
