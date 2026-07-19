import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_RESOURCE,
  STORAGE_RESOURCE_TRAILING_SLASH,
  storageManagedIdentityCredential,
  storageManagedIdentityToken,
} from './index';

const ORIGINAL_ENV = { ...process.env };

/** MSI 200 with `expires_on` a given number of seconds from now. */
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
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('storageManagedIdentityToken — AccessToken shape (A1)', () => {
  it('defaults to the trailing-slash storage audience the two Blob sites minted', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { headers?: Record<string, string> }) => msiResponse('tok', 3600));
    vi.stubGlobal('fetch', fetchMock);

    const at = await storageManagedIdentityToken(); // default audience
    expect(at.token).toBe('tok');
    expect(typeof at.expiresOnTimestamp).toBe('number');
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `resource=${encodeURIComponent(STORAGE_RESOURCE_TRAILING_SLASH)}&`,
    );
  });

  it('carries the BARE audience option the Queue-REST site mints (no trailing slash)', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { headers?: Record<string, string> }) => msiResponse('tok', 3600));
    vi.stubGlobal('fetch', fetchMock);

    await storageManagedIdentityToken({ audience: STORAGE_RESOURCE });
    expect(String(fetchMock.mock.calls[0][0])).toContain(`resource=${encodeURIComponent(STORAGE_RESOURCE)}&`);
    // The two forms are distinct audience strings — never silently normalised into each other.
    expect(STORAGE_RESOURCE).toBe('https://storage.azure.com');
    expect(STORAGE_RESOURCE_TRAILING_SLASH).toBe('https://storage.azure.com/');
  });

  it('reports the REAL mint expiry (not a fabricated one) so the SDK never caches a stale token', async () => {
    // expires_on 120s out → expiresOnTimestamp must track it, proving the wrapper threads the
    // primitive's actual expiry rather than inventing a long-lived one.
    const fetchMock = vi.fn(async () => msiResponse('tok', 120));
    vi.stubGlobal('fetch', fetchMock);

    const before = Date.now();
    const at = await storageManagedIdentityToken({ audience: 'https://storage.azure.com/expiry-probe' });
    expect(at.expiresOnTimestamp).toBeGreaterThanOrEqual(before + 119_000);
    expect(at.expiresOnTimestamp).toBeLessThanOrEqual(Date.now() + 121_000);
  });

  it('storageManagedIdentityCredential() is a getToken()-shaped TokenCredential', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => msiResponse('cred-tok', 3600)));
    const credential = storageManagedIdentityCredential({ audience: 'https://storage.azure.com/cred-probe' });
    const at = await credential.getToken();
    expect(at).toMatchObject({ token: 'cred-tok' });
    expect(typeof at.expiresOnTimestamp).toBe('number');
  });
});

describe('storageManagedIdentityToken — error contract (A2)', () => {
  for (const status of [429, 500, 503] as const) {
    it(`translates a ${status} mint failure into the storage retry contract`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status })));
      const error = await storageManagedIdentityToken({ audience: `https://storage.azure.com/err-${status}` })
        .catch((e: unknown) => e) as { message: string; statusCode?: number; code?: string };
      expect(error.message).toBe(`MSI storage token ${status}`);
      expect(error.statusCode).toBe(status);
      expect(error.code).toBe('ManagedIdentityTokenError');
    });
  }

  it('passes a terminal config fault through unchanged (no MI endpoint) — stays terminal', async () => {
    delete process.env.IDENTITY_ENDPOINT;
    delete process.env.IDENTITY_HEADER;
    const error = await storageManagedIdentityToken({ audience: 'https://storage.azure.com/no-mi' })
      .catch((e: unknown) => e) as { message: string; statusCode?: number; code?: string };
    expect(error.message).toMatch(/IDENTITY_ENDPOINT/);
    expect(error.statusCode).toBeUndefined();
    expect(error.code).not.toBe('ManagedIdentityTokenError');
  });
});
