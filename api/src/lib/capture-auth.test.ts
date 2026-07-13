import { beforeEach, describe, expect, it } from 'vitest';
import type { HttpRequest } from '@azure/functions';
import {
  CAPTURE_RESUME_COOKIE_NAME,
  captureResumeCookie,
  captureResumeSecretFromRequest,
  captureSecretHash,
  clearCaptureResumeCookie,
  mintCaptureAccessToken,
  newBootstrapSecret,
  newResumeSecret,
  verifyCaptureAccessToken,
} from './capture-auth.js';

describe('capture auth', () => {
  beforeEach(() => {
    process.env.CAPTURE_ACCESS_TOKEN_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
  });

  it('creates a 256-bit bootstrap secret and stores only a stable hash', () => {
    const secret = newBootstrapSecret();
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    expect(captureSecretHash(secret)).toMatch(/^[0-9a-f]{64}$/u);
    expect(captureSecretHash(secret)).not.toContain(secret);
  });

  it('creates an independent 256-bit resume secret', () => {
    const secret = newResumeSecret();
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    expect(captureSecretHash(secret)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('reads exactly one correctly named resume cookie and ignores lookalikes', () => {
    const secret = 'r'.repeat(43);
    const request = (cookie: string) => ({
      headers: new Headers({ cookie }),
    }) as unknown as HttpRequest;
    expect(captureResumeSecretFromRequest(request(
      `other=value; ${CAPTURE_RESUME_COOKIE_NAME}=${secret}`,
    ))).toBe(secret);
    expect(captureResumeSecretFromRequest(request(
      `collisioncapture-resume=${secret}`,
    ))).toBeUndefined();
    expect(captureResumeSecretFromRequest(request(
      `${CAPTURE_RESUME_COOKIE_NAME}=${secret}; ${CAPTURE_RESUME_COOKIE_NAME}=${secret}`,
    ))).toBeUndefined();
    expect(captureResumeSecretFromRequest(request(
      `${CAPTURE_RESUME_COOKIE_NAME}=short`,
    ))).toBeUndefined();
  });

  it('serializes a host-only HttpOnly cookie no later than session expiry and clears it safely', () => {
    const now = new Date('2026-07-13T12:00:00.000Z');
    const expires = new Date('2026-07-13T13:00:00.000Z');
    const cookie = captureResumeCookie('r'.repeat(43), expires, now);
    expect(cookie).toBe(
      `${CAPTURE_RESUME_COOKIE_NAME}=${'r'.repeat(43)}; HttpOnly; Secure; SameSite=Strict; `
      + 'Path=/; Max-Age=3600; Expires=Mon, 13 Jul 2026 13:00:00 GMT',
    );
    expect(cookie).not.toContain('Domain=');
    expect(clearCaptureResumeCookie()).toBe(
      `${CAPTURE_RESUME_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; `
      + 'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
  });

  it('mints a 15-minute session-and-generation-scoped bearer', async () => {
    const now = new Date('2026-07-13T12:00:00.000Z');
    const access = await mintCaptureAccessToken('11111111-1111-4111-8111-111111111111', 4, now);
    const request = {
      headers: new Headers({ authorization: `Bearer ${access.token}` }),
    } as unknown as HttpRequest;
    const claims = await verifyCaptureAccessToken(request);
    expect(claims.sub).toBe('11111111-1111-4111-8111-111111111111');
    expect(claims.generation).toBe(4);
    expect(access.expiresAt).toBe('2026-07-13T12:15:00.000Z');
  });

  it('refuses a token signed with a previous key', async () => {
    const access = await mintCaptureAccessToken('session-1', 1);
    process.env.CAPTURE_ACCESS_TOKEN_SECRET = 'a-different-test-secret-that-is-also-long-enough';
    const request = {
      headers: new Headers({ authorization: `Bearer ${access.token}` }),
    } as unknown as HttpRequest;
    await expect(verifyCaptureAccessToken(request)).rejects.toThrow('invalid');
  });
});
