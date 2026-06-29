/**
 * api/src/lib/auth.ts — Entra JWT validation + app-role authz.
 *
 * Validates Bearer tokens via the tenant JWKS and enforces the CollisionSpike.User /
 * .Superuser app roles (legacy .Admin is still accepted as a Superuser alias for
 * back-compat). Plan 21 "Entra JWT validation + app-role authz (API side)" section.
 *
 * Azure Functions provides no built-in JWT validation for Node (App Service Easy Auth
 * injects client identity only for .NET). We validate in code with 'jose' against the
 * tenant JWKS, then read the 'roles' claim.
 *
 * App-settings required:
 *   ENTRA_TENANT_ID  — non-secret; the Entra tenant GUID
 *   API_AUDIENCE     — non-secret; the Data API's client-id GUID. v2 access tokens
 *                      (the reg's requestedAccessTokenVersion=2) carry aud = the BARE client-id
 *                      GUID, NOT 'api://<id>'. Both forms are accepted defensively (audienceCandidates).
 *
 * All function registrations use authLevel: 'anonymous' — the bearer token is the gate.
 */

import { createRemoteJWKSet, jwtVerify, errors, type JWTPayload } from 'jose';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const TENANT = process.env.ENTRA_TENANT_ID!;
const API_AUDIENCE = process.env.API_AUDIENCE!;
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

// Lazily initialised so the Function App starts even if env vars are not yet set locally.
let _jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`),
    );
  }
  return _jwks;
}

// The two enforceable in-app roles. 'CollisionSpike.Superuser' is the full-privilege role
// (renamed from 'CollisionSpike.Admin' 2026-06-27); 'CollisionSpike.Engineer' exists as a
// defined-but-unenforced placeholder app-role (assessment functionality is added later).
export type AppRole = 'CollisionSpike.User' | 'CollisionSpike.Superuser';

// Back-compat: a token minted before the rename still carries the legacy 'CollisionSpike.Admin'
// value. Treat either as superuser so renaming the app-role can never lock out an assigned user.
const SUPERUSER_VALUES = ['CollisionSpike.Superuser', 'CollisionSpike.Admin'];
function hasSuperuser(roles: string[]): boolean {
  return roles.some((r) => SUPERUSER_VALUES.includes(r));
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Map a thrown error to a response with consistent semantics:
 *   - an HttpError (e.g. the 401 from authenticate) → its own status + message;
 *   - anything else → 500 {error:'internal'} (logged, never leaked).
 * Shared by withRole and the internal routes' withServiceAuth so an UNEXPECTED
 * failure (e.g. a transient JWKS fetch error, which jose surfaces as a non-JOSE
 * throw) becomes a 500 server fault, not a misleading 401 "bad token" — the
 * latter is non-retryable and would mis-diagnose a transient outage as auth.
 */
export function toErrorResponse(e: unknown, ctx: InvocationContext): HttpResponseInit {
  if (e instanceof HttpError) {
    return { status: e.status, jsonBody: { error: e.message } };
  }
  ctx.error(e);
  return { status: 500, jsonBody: { error: 'internal' } };
}

/**
 * Validate the Bearer token in the Authorization header.
 * Throws HttpError(401) if missing/invalid; returns the verified JWT payload.
 */
/**
 * Accept BOTH audience forms — the bare client-id GUID (what v2 access tokens carry) and the
 * `api://<id>` App ID URI — so validation is correct regardless of how API_AUDIENCE is set or the
 * token version. (A single-form check against `api://<id>` rejected every v2 token and, via the
 * catch in withRole, surfaced as a 500 — the headline "every page → 500 {error:internal}" outage.)
 */
function audienceCandidates(): string[] {
  const a = API_AUDIENCE;
  if (!a) return [];
  const bare = a.startsWith('api://') ? a.slice('api://'.length) : a;
  return [bare, `api://${bare}`];
}

export async function authenticate(req: HttpRequest): Promise<JWTPayload> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: ISSUER,
      audience: audienceCandidates(),
    });
    return payload;
  } catch (e) {
    // Any jose validation failure (bad audience/issuer/signature/expiry, or a JWKS problem) is an
    // AUTHENTICATION failure, not a server fault → 401 (lets the SPA re-acquire a token), NOT 500.
    if (e instanceof errors.JOSEError) {
      throw new HttpError(401, 'Invalid or expired token');
    }
    throw e; // genuinely unexpected → falls through to withRole's 500 path
  }
}

/**
 * Wrap a handler with Entra JWT authentication + required app-role enforcement.
 * Superuser implies User (superset).
 */
export function withRole(
  required: AppRole,
  handler: (
    req: HttpRequest,
    ctx: InvocationContext,
    claims: JWTPayload,
  ) => Promise<HttpResponseInit>,
): (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit> {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const claims = await authenticate(req);
      const roles = (claims.roles as string[] | undefined) ?? [];
      // Superuser satisfies any route; a User-required route also accepts a plain User.
      const ok =
        required === 'CollisionSpike.Superuser'
          ? hasSuperuser(roles)
          : roles.includes('CollisionSpike.User') || hasSuperuser(roles);
      if (!ok) return { status: 403, jsonBody: { error: 'forbidden' } };
      return await handler(req, ctx, claims);
    } catch (e) {
      return toErrorResponse(e, ctx);
    }
  };
}
