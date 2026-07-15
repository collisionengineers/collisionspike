/**
 * api/src/lib/api-key-auth.test.ts — unit tests for the provider API-key auth wrapper.
 *
 * Covers the pure key helpers (hash determinism, mint shape, shape pre-filter) and the
 * withApiKey flow with the DB layer mocked: a valid matching key resolves the provider
 * context; a missing/malformed/unknown/revoked/wrong-hash key all fail closed with a
 * generic 401; a prefix collision is disambiguated by the constant-time hash compare.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

// Mock the DB layer — verifyApiKey looks keys up by prefix; the tests drive the rows returned.
const queryMock = vi.hoisted(() => vi.fn());
vi.mock('./db.js', () => ({ query: queryMock }));

import {
  hashApiKey,
  generateApiKey,
  looksLikeApiKey,
  withApiKey,
  API_KEY_PREFIX,
  type ApiKeyContext,
} from './api-key-auth.js';

function req(apiKey?: string): HttpRequest {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === 'x-api-key' ? apiKey ?? null : null),
    },
  } as unknown as HttpRequest;
}
function fakeCtx(): InvocationContext {
  return { error: vi.fn() } as unknown as InvocationContext;
}

beforeEach(() => queryMock.mockReset());

/* ----------  pure helpers  ---------- */

describe('hashApiKey', () => {
  it('is a deterministic SHA-256 hex digest (64 chars)', () => {
    const h = hashApiKey('cspk_hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey('cspk_hello')).toBe(h);
    expect(hashApiKey('cspk_world')).not.toBe(h);
  });
});

describe('generateApiKey', () => {
  it('mints cspk_-prefixed secrets with a 12-char display prefix and matching hash', () => {
    const { plaintext, keyPrefix, keyHash } = generateApiKey();
    expect(plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(plaintext.length).toBeGreaterThanOrEqual(API_KEY_PREFIX.length + 32);
    expect(keyPrefix).toBe(plaintext.slice(0, 12));
    expect(keyPrefix.length).toBe(12);
    expect(keyHash).toBe(hashApiKey(plaintext));
  });
  it('mints a fresh secret each call', () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext);
  });
});

describe('looksLikeApiKey', () => {
  it('accepts a well-formed key and rejects malformed ones', () => {
    expect(looksLikeApiKey(generateApiKey().plaintext)).toBe(true);
    expect(looksLikeApiKey('')).toBe(false);
    expect(looksLikeApiKey('nope')).toBe(false);
    expect(looksLikeApiKey('cspk_short')).toBe(false); // too short
    expect(looksLikeApiKey('Bearer abc')).toBe(false);
  });
});

/* ----------  withApiKey flow (DB mocked)  ---------- */

async function invoke(apiKey?: string): Promise<{ status?: number; body: unknown; captured?: ApiKeyContext }> {
  let captured: ApiKeyContext | undefined;
  const handler = withApiKey(async (_req, _ctx, key) => {
    captured = key;
    return { status: 200, jsonBody: { ok: true } };
  });
  const res = await handler(req(apiKey), fakeCtx());
  return { status: res.status, body: res.jsonBody, captured };
}

describe('withApiKey', () => {
  it('rejects a missing X-Api-Key header (401, generic)', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid API key' });
    expect(queryMock).not.toHaveBeenCalled(); // shape pre-filter short-circuits before any DB hit
  });

  it('rejects a malformed key without a DB lookup (401)', async () => {
    const res = await invoke('not-a-key');
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('resolves the provider context for a valid matching key (200) and stamps last_used', async () => {
    const { plaintext, keyHash } = generateApiKey();
    // 1st query = prefix lookup; 2nd = the fire-and-forget last_used update.
    queryMock
      .mockResolvedValueOnce([
        { id: 'key-1', work_provider_id: 'wp-1', key_hash: keyHash, revoked_at: null },
      ])
      .mockResolvedValueOnce([]);
    const res = await invoke(plaintext);
    expect(res.status).toBe(200);
    expect(res.captured).toEqual({ workProviderId: 'wp-1', keyId: 'key-1' });
    expect(queryMock.mock.calls[1][0]).toMatch(/last_used_at/);
  });

  it('rejects a revoked key (401) even when the hash matches', async () => {
    const { plaintext, keyHash } = generateApiKey();
    queryMock.mockResolvedValueOnce([
      { id: 'key-1', work_provider_id: 'wp-1', key_hash: keyHash, revoked_at: new Date() },
    ]);
    const res = await invoke(plaintext);
    expect(res.status).toBe(401);
  });

  it('rejects a prefix hit whose hash does not match (401)', async () => {
    const presented = generateApiKey().plaintext;
    const otherHash = hashApiKey('a totally different secret');
    queryMock.mockResolvedValueOnce([
      { id: 'key-1', work_provider_id: 'wp-1', key_hash: otherHash, revoked_at: null },
    ]);
    const res = await invoke(presented);
    expect(res.status).toBe(401);
  });

  it('rejects an unknown key (no prefix rows) (401)', async () => {
    queryMock.mockResolvedValueOnce([]);
    const res = await invoke(generateApiKey().plaintext);
    expect(res.status).toBe(401);
  });

  it('picks the matching row when the prefix collides across two keys', async () => {
    const a = generateApiKey();
    const b = generateApiKey();
    // Present b; both rows share a prefix, only b's hash matches.
    queryMock
      .mockResolvedValueOnce([
        { id: 'key-a', work_provider_id: 'wp-a', key_hash: a.keyHash, revoked_at: null },
        { id: 'key-b', work_provider_id: 'wp-b', key_hash: b.keyHash, revoked_at: null },
      ])
      .mockResolvedValueOnce([]);
    const res = await invoke(b.plaintext);
    expect(res.status).toBe(200);
    expect(res.captured).toEqual({ workProviderId: 'wp-b', keyId: 'key-b' });
  });
});
