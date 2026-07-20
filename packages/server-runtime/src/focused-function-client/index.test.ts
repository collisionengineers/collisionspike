import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FN_STAGE_TIMEOUT_MS,
  FunctionCallError,
  focusedFnRequest,
  type FocusedFnErrorMapper,
} from './index';

function stubFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// A mapper that never decides the error contract for the core — each test supplies the one it needs.
const bare: FocusedFnErrorMapper = (res) => new Error(`status ${res.status}`);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('focusedFnRequest transport', () => {
  it('appends the path verbatim, sets the key header, JSON body + Content-Type, and returns JSON', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(
      focusedFnRequest({
        baseUrl: 'https://fn.example',
        functionKey: 'k',
        method: 'POST',
        path: '/api/x',
        body: { a: 1 },
        mapError: bare,
      }),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    const options = init as RequestInit;
    expect(String(url)).toBe('https://fn.example/api/x'); // baseUrl + path verbatim, no normalisation
    expect(options.method).toBe('POST');
    const headers = options.headers as Record<string, string>;
    expect(headers['x-functions-key']).toBe('k');
    expect(headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ a: 1 }));
    expect(options.signal ?? undefined).toBeUndefined(); // no timeout → no abort signal
  });

  it('omits the key header when no key is given and Content-Type/body when no body is given', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

    await focusedFnRequest({ baseUrl: 'https://fn.example', method: 'GET', path: '/api/y', mapError: bare });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['x-functions-key']).toBeUndefined();
    expect(headers['Content-Type']).toBeUndefined();
    expect(options.body ?? undefined).toBeUndefined();
  });

  it('returns undefined for a 204 when emptyOn204 is set (no JSON parse)', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      focusedFnRequest({ baseUrl: 'https://fn.example', method: 'POST', path: '/api/x', emptyOn204: true, mapError: bare }),
    ).resolves.toBeUndefined();
  });
});

describe('focusedFnRequest error contract is caller-owned (error-neutral seam)', () => {
  it('orchestration mapper: RETAINS the upstream body in a plain Error', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response('upstream detail', { status: 502 }));
    const includeBody: FocusedFnErrorMapper = async (res, { method, label, path }) =>
      new Error(`fn ${method} ${label ?? path} → ${res.status}: ${(await res.text().catch(() => '<no body>')).slice(0, 500)}`);

    const error = (await focusedFnRequest({
      baseUrl: 'https://fn.example',
      functionKey: 'k',
      method: 'POST',
      path: '/api/classify-email',
      label: 'classify-email',
      mapError: includeBody,
    }).catch((e: unknown) => e)) as Error;

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('fn POST classify-email → 502: upstream detail'); // label preferred over path
  });

  it('data-api mapper: DRAINS and DISCARDS the body, throws a typed FunctionCallError with status only', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response('customer-name and identifiers', { status: 503 }));
    const statusOnly: FocusedFnErrorMapper = async (res, { method, path }) => {
      await res.text().catch(() => '');
      return new FunctionCallError(`[functions-client] ${method} ${path} returned HTTP ${res.status}`, res.status);
    };

    const error = (await focusedFnRequest({
      baseUrl: 'https://fn.example',
      functionKey: 'k',
      method: 'GET',
      path: '/api/box/files/1',
      mapError: statusOnly,
    }).catch((e: unknown) => e)) as FunctionCallError;

    expect(error).toBeInstanceOf(FunctionCallError);
    expect(error.status).toBe(503);
    expect(error.message).not.toContain('customer-name');
  });
});

describe('focusedFnRequest opt-in timeout', () => {
  it('threads an AbortSignal and maps an abort to onTimeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      expect(signal).toBeInstanceOf(AbortSignal);
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const p = focusedFnRequest({
      baseUrl: 'https://fn.example',
      functionKey: 'k',
      method: 'POST',
      path: '/api/plate-ocr',
      timeoutMs: FN_STAGE_TIMEOUT_MS,
      mapError: bare,
      onTimeout: ({ method, path, timeoutMs }) => new Error(`${method} ${path} → timed out after ${timeoutMs}ms`),
    });
    const assertion = expect(p).rejects.toThrow(/timed out after 30000ms/);
    await vi.advanceTimersByTimeAsync(FN_STAGE_TIMEOUT_MS + 1);
    await assertion;
  });
});
