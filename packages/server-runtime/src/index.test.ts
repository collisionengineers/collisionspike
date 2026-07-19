import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SERVER_RUNTIME_PACKAGE,
  ManagedIdentityTokenError,
  getManagedIdentityToken,
} from './index';

// The dev-token fallback shells out to `az`; mock the child process so the dev path is
// exercised without a real CLI. Only the dev-token test relies on this; the fetch-based
// tests never touch child_process.
vi.mock('node:child_process', () => ({
  execFile: (_cmd: string, _args: string[], cb: (err: Error | null, stdout: string) => void) =>
    cb(null, 'dev-token-value\n'),
}));

const ORIGINAL_ENV = { ...process.env };

/** MSI token response with `expires_on` a given number of seconds from now. */
function msiResponse(token: string, expiresInSeconds: number): Response {
  return new Response(
    JSON.stringify({ access_token: token, expires_on: String(Math.floor(Date.now() / 1000) + expiresInSeconds) }),
    { status: 200 },
  );
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.IDENTITY_ENDPOINT = 'http://169.254.169.254/msi/token';
  process.env.IDENTITY_HEADER = 'test-identity-header';
  delete process.env.DATA_API_TOKEN;
  delete process.env.AOAI_DEV_TOKEN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('@cs/server-runtime package identity', () => {
  it('exposes its package identity', () => {
    expect(SERVER_RUNTIME_PACKAGE).toBe('@cs/server-runtime');
  });
});

describe('getManagedIdentityToken — cache boundary', () => {
  it('mints on a miss and returns the cached value on a hit (one fetch for two calls)', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { headers?: Record<string, string> }) =>
      msiResponse('tok-fresh', 3600),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await getManagedIdentityToken('aud://cache-hit');
    const second = await getManagedIdentityToken('aud://cache-hit');

    expect(first).toBe('tok-fresh');
    expect(second).toBe('tok-fresh');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The mint used the raw MSI contract (api-version + X-IDENTITY-HEADER).
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('resource=aud%3A%2F%2Fcache-hit');
    expect(String(url)).toContain('api-version=2019-08-01');
    expect(init?.headers?.['X-IDENTITY-HEADER']).toBe('test-identity-header');
  });

  it('refreshes a token that is within the 60-second expiry skew (near-expiry refresh)', async () => {
    // First mint expires in 30s → inside the 60s skew → the next call must re-mint.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(msiResponse('tok-old', 30))
      .mockResolvedValueOnce(msiResponse('tok-new', 3600));
    vi.stubGlobal('fetch', fetchMock);

    const first = await getManagedIdentityToken('aud://near-expiry');
    const second = await getManagedIdentityToken('aud://near-expiry');

    expect(first).toBe('tok-old');
    expect(second).toBe('tok-new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches a token that reports no expiry using fallbackTtlMs (token-absent fallback path)', async () => {
    // No `expires_on` in the response → expiresAt = now + fallbackTtlMs. A large TTL means
    // the immediate second call is a cache hit; a below-skew TTL forces an immediate re-mint.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'tok-noexp' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getManagedIdentityToken('aud://fallback-cached', { fallbackTtlMs: 600_000 });
    await getManagedIdentityToken('aud://fallback-cached', { fallbackTtlMs: 600_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached with a 10-minute fallback TTL

    // A fallback TTL at/below the 60s skew is never a durable cache → always re-mints.
    await getManagedIdentityToken('aud://fallback-shortlived', { fallbackTtlMs: 60_000 });
    await getManagedIdentityToken('aud://fallback-shortlived', { fallbackTtlMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('surfaces the mint HTTP status on failure (A1) — not an opaque error', async () => {
    const fetchMock = vi.fn(async () => new Response('throttled', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await getManagedIdentityToken('aud://fails').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ManagedIdentityTokenError);
    expect((error as ManagedIdentityTokenError).status).toBe(429);
    expect((error as ManagedIdentityTokenError).audience).toBe('aud://fails');
    expect((error as ManagedIdentityTokenError).code).toBe('ManagedIdentityTokenError');
  });

  it('returns the localTokenEnv override VERBATIM before any managed-identity call (A2)', async () => {
    process.env.DATA_API_TOKEN = 'local-dev-token';
    // A fetch that throws if called proves no MI request is made when the override is present.
    const fetchMock = vi.fn(async () => {
      throw new Error('MI endpoint must not be called when the local override is set');
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = await getManagedIdentityToken('aud://data-api', { localTokenEnv: 'DATA_API_TOKEN' });
    expect(token).toBe('local-dev-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the az-CLI dev-token fallback off-Azure when explicitly opted in (dev-token path)', async () => {
    // Off Azure: no managed-identity endpoint.
    delete process.env.IDENTITY_ENDPOINT;
    delete process.env.IDENTITY_HEADER;
    process.env.AOAI_DEV_TOKEN = '1';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const token = await getManagedIdentityToken('aud://cognitive', {
      devTokenFallback: { enabledEnv: 'AOAI_DEV_TOKEN', resource: 'https://cognitiveservices.azure.com' },
    });
    expect(token).toBe('dev-token-value'); // trimmed az stdout
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT shell out to az unless the dev fallback is explicitly opted in', async () => {
    delete process.env.IDENTITY_ENDPOINT;
    delete process.env.IDENTITY_HEADER;
    // AOAI_DEV_TOKEN is unset → the opt-in gate is closed → config fault, no CLI attempt.
    // Distinct audience so the opted-in test above cannot warm this cache slot.
    await expect(
      getManagedIdentityToken('aud://cognitive-nooptin', {
        devTokenFallback: { enabledEnv: 'AOAI_DEV_TOKEN', resource: 'https://cognitiveservices.azure.com' },
      }),
    ).rejects.toThrow(/missing IDENTITY_ENDPOINT/);
  });
});

describe('getManagedIdentityToken — concurrent cold coalescing', () => {
  it('coalesces concurrent cold misses for one audience onto a single mint (no endpoint fan-out)', async () => {
    // A gate so all five callers reach the cache-miss + in-flight path before the mint resolves.
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => gate);
    vi.stubGlobal('fetch', fetchMock);

    const pending = Promise.all(
      Array.from({ length: 5 }, () => getManagedIdentityToken('aud://coalesce')),
    );
    release(msiResponse('tok-coalesced', 3600));
    const tokens = await pending;

    expect(tokens).toEqual(Array(5).fill('tok-coalesced'));
    // Five concurrent cold callers, ONE identity-endpoint request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight entry on failure so the next caller re-mints (a failed mint is not sticky)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('throttled', { status: 429 }))
      .mockResolvedValueOnce(msiResponse('tok-after-recovery', 3600));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getManagedIdentityToken('aud://coalesce-retry')).rejects.toBeInstanceOf(ManagedIdentityTokenError);
    // The rejected mint left no in-flight entry and cached nothing, so the next call mints afresh.
    const token = await getManagedIdentityToken('aud://coalesce-retry');
    expect(token).toBe('tok-after-recovery');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
