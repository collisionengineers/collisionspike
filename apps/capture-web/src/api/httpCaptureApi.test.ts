import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpCaptureApi } from './httpCaptureApi';

const authorization = {
  sessionId: 'session/one',
  accessToken: 'short-lived-secret',
  accessTokenExpiresAt: '2099-07-13T12:00:00.000Z'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('HttpCaptureApi', () => {
  beforeEach(() => {
    authorization.accessToken = 'short-lived-secret';
    authorization.accessTokenExpiresAt = '2099-07-13T12:00:00.000Z';
  });

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
    expect(init?.credentials).toBe('include');
  });

  it('coalesces resume-cookie renewal and never adds bearer authorization', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      sessionId: 'session/one',
      accessToken: 'renewed-secret',
      accessTokenExpiresAt: '2099-07-13T13:00:00.000Z'
    }));
    const api = new HttpCaptureApi();

    const first = api.renew();
    const second = api.renew();
    expect(first).toBe(second);
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/public/capture/renew');
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('renews proactively and retries with the rotated in-memory bearer token', async () => {
    authorization.accessTokenExpiresAt = '2000-01-01T00:00:00.000Z';
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        sessionId: 'session/one',
        accessToken: 'renewed-secret',
        accessTokenExpiresAt: '2099-07-13T13:00:00.000Z'
      }))
      .mockResolvedValueOnce(jsonResponse({ sessionId: 'session/one' }));

    await new HttpCaptureApi().getManifest(authorization);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/public/capture/renew',
      '/api/public/capture/sessions/session%2Fone'
    ]);
    expect(new Headers(fetchMock.mock.calls[1]![1]?.headers).get('Authorization'))
      .toBe('Bearer renewed-secret');
    expect(authorization.accessToken).toBe('renewed-secret');
  });

  it('renews once after a bearer 401 and retries the original request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        error: 'capture_unauthorized',
        message: 'Access expired.'
      }, 401))
      .mockResolvedValueOnce(jsonResponse({
        sessionId: 'session/one',
        accessToken: 'renewed-after-401',
        accessTokenExpiresAt: '2099-07-13T13:00:00.000Z'
      }))
      .mockResolvedValueOnce(jsonResponse({ sessionId: 'session/one' }));

    await new HttpCaptureApi().getManifest(authorization);

    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/public/capture/renew');
    expect(new Headers(fetchMock.mock.calls[2]![1]?.headers).get('Authorization'))
      .toBe('Bearer renewed-after-401');
  });

  it('rejects a renewal response for a different session', async () => {
    authorization.accessTokenExpiresAt = '2000-01-01T00:00:00.000Z';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      sessionId: 'another-session',
      accessToken: 'wrong-session-secret',
      accessTokenExpiresAt: '2099-07-13T13:00:00.000Z'
    }));

    await expect(new HttpCaptureApi().getManifest(authorization)).rejects.toMatchObject({
      code: 'capture_unauthorized',
      status: 401
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(authorization.accessToken).toBe('short-lived-secret');
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

  it('treats an expired direct-upload SAS as retryable rather than invalidating the session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    await expect(new HttpCaptureApi().uploadFile({
      uploadId: 'upload-1',
      assetId: 'asset-1',
      method: 'direct',
      uploadUrl: 'https://storage.example.test/object?sas=expired',
      headers: { 'x-ms-blob-type': 'BlockBlob' },
      expiresAt: '2026-07-13T12:00:00.000Z'
    }, new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({
      code: 'capture_retryable',
      retryable: true,
      status: 403
    });
  });

  it('sends a stable idempotency key when creating an upload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
    await new HttpCaptureApi().createUpload(authorization, 'stable-attempt-key-0001', {
      shotId: 'overview',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 5,
      sha256: 'a'.repeat(64),
      clientObservation: {
        route: 'guided',
        disposition: 'unassessed',
        stableFrames: 0,
        rulesVersion: 'quality-v1'
      }
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/public/capture/sessions/session%2Fone/uploads');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('stable-attempt-key-0001');
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('idempotencyKey');
  });

  it('sends submission idempotency only in the header and omits a JSON body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      status: 'complete',
      completedAt: '2026-07-13T12:00:00.000Z'
    }));

    await new HttpCaptureApi().submit(authorization, 'stable-submit-key-0001');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/public/capture/sessions/session%2Fone/submit');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('stable-submit-key-0001');
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    expect(init?.body).toBeUndefined();
    expect(init?.credentials).toBe('include');
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
