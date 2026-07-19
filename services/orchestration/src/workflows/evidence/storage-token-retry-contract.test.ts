/**
 * (A2) TKT-250 round-trip: the CONSOLIDATED storage credential (`@cs/server-runtime`, replacing the
 * former hand-rolled `platform/blob.ts` `storageMiToken()` mint) must still fail with the EXACT retry
 * contract this consumer's REAL `isRetryableStorageInfrastructureError` matches — `statusCode` +
 * `code: 'ManagedIdentityTokenError'` + the `MSI storage token <status>` message — so a transient
 * managed-identity/metadata 429/5xx is still redelivered instead of failing the backfill terminally.
 *
 * We import the predicate from `evidence-backfill.ts` itself (not a re-implementation), stubbing only
 * the two module-scope Functions/durable registrations so the module loads with no host.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageManagedIdentityCredential, storageManagedIdentityToken } from '@cs/server-runtime';

vi.mock('@azure/functions', () => ({ app: { storageQueue: () => {}, http: () => {}, timer: () => {} } }));
vi.mock('durable-functions', () => ({
  app: { activity: () => {}, orchestration: () => {} },
  input: { durableClient: () => ({}) },
  getClient: () => ({}),
  RetryOptions: class {},
}));

const { isRetryableStorageInfrastructureError } = await import('./evidence-backfill.js');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.IDENTITY_ENDPOINT = 'http://169.254.169.254/msi/token';
  process.env.IDENTITY_HEADER = 'test-identity-header';
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('consolidated storage credential preserves the evidence-backfill retry contract (A2)', () => {
  // Distinct audiences per case keep each mint off the primitive's shared per-audience cache, so the
  // failing fetch is always exercised (a cached success would short-circuit it).
  for (const status of [429, 500, 503] as const) {
    it(`a ${status} storage mint failure carries the contract AND is classified retryable`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status })));
      const credential = storageManagedIdentityCredential({ audience: `https://storage.azure.com/a2-${status}` });

      const error = await credential.getToken().catch((e: unknown) => e) as {
        message: string; statusCode?: number; code?: string;
      };
      expect(error.statusCode).toBe(status);
      expect(error.code).toBe('ManagedIdentityTokenError');
      expect(error.message).toBe(`MSI storage token ${status}`);
      expect(isRetryableStorageInfrastructureError(error)).toBe(true);
      // The same shape nested as a transport `cause` (how the storage SDK may surface a getToken throw).
      expect(isRetryableStorageInfrastructureError(new Error('blob op failed', { cause: error }))).toBe(true);
    });
  }

  it('a terminal 403 storage mint failure is NOT classified retryable (client fault stays terminal)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })));
    const error = await storageManagedIdentityToken({ audience: 'https://storage.azure.com/a2-403' })
      .catch((e: unknown) => e) as { statusCode?: number; message: string };
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('MSI storage token 403');
    expect(isRetryableStorageInfrastructureError(error)).toBe(false);
  });
});
