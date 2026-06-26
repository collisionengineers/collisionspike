/**
 * api/src/lib/auth.ts — Entra JWT validation + app-role authz.
 *
 * Validates Bearer tokens via the tenant JWKS and enforces CollisionSpike.User / .Admin
 * app roles. Plan 21 "Entra JWT validation + app-role authz (API side)" section.
 *
 * Azure Functions provides no built-in JWT validation for Node (App Service Easy Auth
 * injects client identity only for .NET). We validate in code with 'jose' against the
 * tenant JWKS, then read the 'roles' claim.
 *
 * App-settings required:
 *   ENTRA_TENANT_ID  — non-secret; the Entra tenant GUID
 *   API_AUDIENCE     — non-secret; e.g. 'api://<data-api-client-id>'
 *
 * All function registrations use authLevel: 'anonymous' — the bearer token is the gate.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
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

export type AppRole = 'CollisionSpike.User' | 'CollisionSpike.Admin';

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Validate the Bearer token in the Authorization header.
 * Throws HttpError(401) if missing/invalid; returns the verified JWT payload.
 */
export async function authenticate(req: HttpRequest): Promise<JWTPayload> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: ISSUER,
    audience: API_AUDIENCE,
  });
  return payload;
}

/**
 * Wrap a handler with Entra JWT authentication + required app-role enforcement.
 * Admin implies User (superset).
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
      const ok =
        roles.includes(required) ||
        (required === 'CollisionSpike.User' && roles.includes('CollisionSpike.Admin'));
      if (!ok) return { status: 403, jsonBody: { error: 'forbidden' } };
      return await handler(req, ctx, claims);
    } catch (e) {
      if (e instanceof HttpError) {
        return { status: e.status, jsonBody: { error: e.message } };
      }
      ctx.error(e);
      return { status: 500, jsonBody: { error: 'internal' } };
    }
  };
}
