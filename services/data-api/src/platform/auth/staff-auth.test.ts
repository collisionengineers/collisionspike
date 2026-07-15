/**
 * services/data-api/src/platform/auth/staff-auth.test.ts — unit tests for the Entra JWT validation + app-role authz.
 *
 * These exercise the REAL jose verifier: only createRemoteJWKSet is mocked (to resolve
 * against a locally-generated keypair) so signature, audience, issuer and expiry are all
 * genuinely enforced by jose — not by a stub. Tokens are minted with jose's SignJWT.
 *
 * Coverage: valid User/Superuser tokens, both accepted audience FORMS (bare GUID +
 * api://GUID), wrong audience, wrong issuer, expired token, tampered signature, missing
 * role (403), legacy CollisionSpike.Admin accepted as Superuser, missing/malformed
 * Authorization header (401), handler throw → 500, and toErrorResponse mapping.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

// The Function reads these at import time — set BEFORE auth.ts is imported (hoisted).
const TENANT = vi.hoisted(() => '858cf5b3-1111-2222-3333-444455556666');
const AUD = vi.hoisted(() => 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72'); // the real Data API client-id
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

// Mock ONLY createRemoteJWKSet — keep the real jwtVerify / SignJWT / generateKeyPair /
// errors so every claim is verified for real. The resolver returns our local public key.
const keyHolder = vi.hoisted(() => ({ key: undefined as unknown }));
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    createRemoteJWKSet: () => async () => keyHolder.key,
  };
});

import { SignJWT, generateKeyPair, type KeyLike } from 'jose';
import { withRole, authenticate, toErrorResponse, HttpError } from './staff-auth.js';

let signKey: KeyLike; // the private key whose public half the verifier trusts
let otherKey: KeyLike; // an UNTRUSTED private key, for the tampered-signature case

beforeAll(async () => {
  const trusted = await generateKeyPair('RS256');
  const untrusted = await generateKeyPair('RS256');
  signKey = trusted.privateKey;
  otherKey = untrusted.privateKey;
  keyHolder.key = trusted.publicKey; // the verifier resolves to THIS key
});

interface MintOpts {
  aud?: string;
  iss?: string;
  roles?: string[];
  expSeconds?: number; // absolute epoch seconds; default = +5 min
  key?: KeyLike;
}
async function mint(opts: MintOpts = {}): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles: opts.roles ?? ['CollisionSpike.User'] })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(nowSec - 60)
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? AUD)
    .setExpirationTime(opts.expSeconds ?? nowSec + 300)
    .sign(opts.key ?? signKey);
}

function req(authHeader?: string): HttpRequest {
  return {
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'authorization' ? authHeader ?? null : null,
    },
  } as unknown as HttpRequest;
}

function fakeCtx(): InvocationContext {
  return { error: vi.fn() } as unknown as InvocationContext;
}

const okHandler = vi.fn(async () => ({ status: 200, jsonBody: { ok: true } }));

async function callUser(authHeader?: string) {
  return withRole('CollisionSpike.User', okHandler)(req(authHeader), fakeCtx());
}
async function callSuper(authHeader?: string) {
  return withRole('CollisionSpike.Superuser', okHandler)(req(authHeader), fakeCtx());
}

/* ----------  happy paths  ---------- */

describe('authenticate / withRole — valid tokens', () => {
  it('accepts a valid User token on a User route (200)', async () => {
    const res = await callUser(`Bearer ${await mint()}`);
    expect(res.status).toBe(200);
  });

  it('accepts the bare-GUID audience form (what v2 tokens carry)', async () => {
    const res = await callUser(`Bearer ${await mint({ aud: AUD })}`);
    expect(res.status).toBe(200);
  });

  it('accepts the api://<id> audience form too', async () => {
    const res = await callUser(`Bearer ${await mint({ aud: `api://${AUD}` })}`);
    expect(res.status).toBe(200);
  });

  it('Superuser token satisfies both a User route and a Superuser route', async () => {
    const tok = `Bearer ${await mint({ roles: ['CollisionSpike.Superuser'] })}`;
    expect((await callUser(tok)).status).toBe(200);
    expect((await callSuper(tok)).status).toBe(200);
  });

  it('accepts legacy CollisionSpike.Admin as Superuser (back-compat)', async () => {
    const tok = `Bearer ${await mint({ roles: ['CollisionSpike.Admin'] })}`;
    expect((await callSuper(tok)).status).toBe(200);
  });

  it('authenticate() returns the verified payload with roles', async () => {
    const payload = await authenticate(req(`Bearer ${await mint({ roles: ['CollisionSpike.User'] })}`));
    expect(payload.aud).toBe(AUD);
    expect(payload.roles).toEqual(['CollisionSpike.User']);
  });
});

/* ----------  authentication failures → 401  ---------- */

describe('withRole — 401 authentication failures', () => {
  it('rejects a wrong audience (401)', async () => {
    const res = await callUser(`Bearer ${await mint({ aud: '00000000-0000-0000-0000-000000000000' })}`);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong issuer (401)', async () => {
    const res = await callUser(`Bearer ${await mint({ iss: 'https://evil.example.com/v2.0' })}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token (401)', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const res = await callUser(`Bearer ${await mint({ expSeconds: nowSec - 60 })}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed by an untrusted key (401)', async () => {
    const res = await callUser(`Bearer ${await mint({ key: otherKey })}`);
    expect(res.status).toBe(401);
  });

  it('rejects a missing Authorization header (401)', async () => {
    const res = await callUser(undefined);
    expect(res.status).toBe(401);
  });

  it('rejects a non-Bearer Authorization header (401)', async () => {
    const res = await callUser('Basic abc123');
    expect(res.status).toBe(401);
  });

  it('does not leak internals on a 401 — body.error is a plain message', async () => {
    const res = await callUser('Basic abc123');
    expect(res.jsonBody).toEqual({ error: 'Missing bearer token' });
  });
});

/* ----------  authorization failures → 403  ---------- */

describe('withRole — 403 authorization failures', () => {
  it('rejects a token with NO roles on a User route (403)', async () => {
    const res = await callUser(`Bearer ${await mint({ roles: [] })}`);
    expect(res.status).toBe(403);
    expect(res.jsonBody).toEqual({ error: 'forbidden' });
  });

  it('rejects a plain User token on a Superuser route (403)', async () => {
    const res = await callSuper(`Bearer ${await mint({ roles: ['CollisionSpike.User'] })}`);
    expect(res.status).toBe(403);
  });

  it('rejects an unrelated/unknown role on a User route (403)', async () => {
    const res = await callUser(`Bearer ${await mint({ roles: ['CollisionSpike.Engineer'] })}`);
    expect(res.status).toBe(403);
  });
});

/* ----------  server faults → 500 (handler throw, unexpected errors)  ---------- */

describe('withRole / toErrorResponse — 500 server faults', () => {
  it('maps a handler throw to 500 {error:internal} (no leakage) and logs it', async () => {
    const ctx = fakeCtx();
    const boom = vi.fn(async () => {
      throw new Error('db exploded with a secret connection string');
    });
    const res = await withRole('CollisionSpike.User', boom)(
      req(`Bearer ${await mint()}`),
      ctx,
    );
    expect(res.status).toBe(500);
    expect(res.jsonBody).toEqual({ error: 'internal' });
    expect(ctx.error).toHaveBeenCalled();
  });

  it('toErrorResponse: HttpError → its own status + message', () => {
    const res = toErrorResponse(new HttpError(401, 'Invalid or expired token'), fakeCtx());
    expect(res.status).toBe(401);
    expect(res.jsonBody).toEqual({ error: 'Invalid or expired token' });
  });

  it('toErrorResponse: unexpected error → 500 internal (logged, not leaked)', () => {
    const ctx = fakeCtx();
    const res = toErrorResponse(new Error('transient JWKS fetch failed'), ctx);
    expect(res.status).toBe(500);
    expect(res.jsonBody).toEqual({ error: 'internal' });
    expect(ctx.error).toHaveBeenCalled();
  });
});
