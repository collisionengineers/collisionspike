import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors, type JWTPayload } from 'jose';
import type { HttpRequest } from '@azure/functions';

const ISSUER = 'collisionspike';
const AUDIENCE = 'collisioncapture';
const ACCESS_SECONDS = 15 * 60;
export const CAPTURE_RESUME_COOKIE_NAME = '__Host-collisioncapture-resume';
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

export interface CaptureAccessClaims extends JWTPayload {
  sub: string;
  generation: number;
  kind: 'capture';
}

function signingKey(): Uint8Array {
  const configured = process.env.CAPTURE_ACCESS_TOKEN_SECRET ?? '';
  if (configured.length < 32) throw new Error('CAPTURE_ACCESS_TOKEN_SECRET must be at least 32 characters');
  return new TextEncoder().encode(configured);
}

export function newBootstrapSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function newResumeSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function captureSecretHash(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function captureResumeSecretFromRequest(req: HttpRequest): string | undefined {
  const raw = req.headers.get('cookie') ?? '';
  const matches = raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${CAPTURE_RESUME_COOKIE_NAME}=`))
    .map((part) => part.slice(CAPTURE_RESUME_COOKIE_NAME.length + 1));
  return matches.length === 1 && SECRET_RE.test(matches[0] ?? '') ? matches[0] : undefined;
}

export function captureResumeCookie(
  secret: string,
  sessionExpiresAt: Date | string,
  now = new Date(),
): string {
  if (!SECRET_RE.test(secret)) throw new Error('capture resume secret is invalid');
  const expires = new Date(sessionExpiresAt);
  const maxAge = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000));
  if (!Number.isFinite(expires.getTime())) throw new Error('capture session expiry is invalid');
  return [
    `${CAPTURE_RESUME_COOKIE_NAME}=${secret}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
    `Expires=${expires.toUTCString()}`,
  ].join('; ');
}

export function clearCaptureResumeCookie(): string {
  return [
    `${CAPTURE_RESUME_COOKIE_NAME}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ].join('; ');
}

export async function mintCaptureAccessToken(
  sessionId: string,
  generation: number,
  now = new Date(),
): Promise<{ token: string; expiresAt: string }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + ACCESS_SECONDS;
  const token = await new SignJWT({ generation, kind: 'capture' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(sessionId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(signingKey());
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export async function verifyCaptureAccessToken(
  req: HttpRequest,
  now = new Date(),
): Promise<CaptureAccessClaims> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new Error('missing');
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: now,
    });
    if (
      payload.kind !== 'capture'
      || typeof payload.sub !== 'string'
      || typeof payload.generation !== 'number'
      || !Number.isInteger(payload.generation)
    ) throw new Error('invalid');
    return payload as CaptureAccessClaims;
  } catch (error) {
    if (error instanceof errors.JOSEError) throw new Error('invalid');
    throw error;
  }
}
