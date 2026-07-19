import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { post, request, type DataApiErrorMapper } from './data-api-http-core';

const ORIGINAL_ENV = { ...process.env };

function stubFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  // A trailing slash proves the base is normalised; the local override means no MI mint is hit.
  process.env.DATA_API_URL = 'https://data.example.test/';
  process.env.DATA_API_TOKEN = 'local-token';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('data-api-http-core request()', () => {
  it('sends the shared bearer + JSON headers and returns parsed JSON', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(request({ method: 'POST', path: '/api/x', body: { a: 1 } })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    const options = init as RequestInit;
    expect(String(url)).toBe('https://data.example.test/api/x'); // trailing slash stripped, path appended verbatim
    expect(options.method).toBe('POST');
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer local-token');
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ a: 1 }));
    expect(options.signal ?? undefined).toBeUndefined(); // no timeout → no abort signal
  });

  it('omits Content-Type and body when no body is given', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

    await request({ method: 'GET', path: '/api/y' });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(options.body ?? undefined).toBeUndefined();
  });

  it('throws "missing DATA_API_URL" when the base is unset', async () => {
    delete process.env.DATA_API_URL;
    stubFetch();
    await expect(request({ method: 'GET', path: '/api/x' })).rejects.toThrow(/missing DATA_API_URL/);
  });

  it('returns undefined for a 204 when emptyOn204 is set (no JSON parse)', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request({ method: 'POST', path: '/api/x', emptyOn204: true })).resolves.toBeUndefined();
  });
});

describe('data-api-http-core default error mapper (the bare adapters’ contract)', () => {
  it('throws a PLAIN Error on every non-2xx (including 409), never a typed conflict', async () => {
    for (const status of [409, 500, 503]) {
      const fetchMock = stubFetch();
      fetchMock.mockResolvedValue(new Response('boom', { status }));
      const error = await request({ method: 'POST', path: '/api/x' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor).toBe(Error); // exactly Error, not a subclass
      expect((error as Error).message).toBe(`data-api POST /api/x -> ${status}: boom`);
    }
  });

  it('truncates the body to 500 chars and tolerates an unreadable body', async () => {
    const longFetch = stubFetch();
    longFetch.mockResolvedValue(new Response('x'.repeat(600), { status: 500 }));
    const long = (await request({ method: 'GET', path: '/api/x' }).catch((e: unknown) => e)) as Error;
    expect(long.message).toBe(`data-api GET /api/x -> 500: ${'x'.repeat(500)}`);

    // A response whose body cannot be read collapses to the empty string (not a throw).
    const unreadable = { ok: false, status: 500, text: async () => { throw new Error('unreadable'); } };
    const badFetch = stubFetch();
    badFetch.mockResolvedValue(unreadable as unknown as Response);
    const empty = (await request({ method: 'GET', path: '/api/x' }).catch((e: unknown) => e)) as Error;
    expect(empty.message).toBe('data-api GET /api/x -> 500: ');
  });

  it('uses a caller-supplied mapError to build a typed error (the rich adapter path)', async () => {
    class ConflictError extends Error {}
    const mapError: DataApiErrorMapper = async (res, { method, path }) =>
      res.status === 409 ? new ConflictError(`${method} ${path} 409`) : new Error('other');
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response('dup', { status: 409 }));

    const error = await request({ method: 'POST', path: '/api/x', mapError }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe('POST /api/x 409');
  });
});

describe('data-api-http-core post()', () => {
  it('defaults to POST and threads an AbortSignal when a timeout is set', async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ processed: 1 }), { status: 200 }));

    await expect(post('/api/drain', { timeoutMs: 60_000 })).resolves.toEqual({ processed: 1 });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
