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
//
// TKT-138 root-cause record (2026-07-09, read-only directory enumeration): the app registration
// (fa2fb28c…) AND its service principal (f5cf0eba…) both read appRoles Engineer/User/Superuser
// (Superuser keeping role-id 5b356d4c per the 2026-06-27 rename), and the operator's ONLY API
// appRoleAssignment targets 5b356d4c — so a FRESH v2 token can only mint
// roles:["CollisionSpike.Superuser"]. The observed ["CollisionSpike.Admin"] claims are stale
// pre-rename token artifacts (MSAL cache / recorded evidence), not directory drift: NO directory
// fix exists to run. This legacy-accept stays DELIBERATELY (belt-and-braces for any cached
// pre-rename token; also recorded in the live registry).
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

/* ============================================================
   Agent authorization DESIGN (PLAN-001 Phase 3, ADR-0023).

   The read-only MCP server (TKT-110) ships wrapped in withRole('CollisionSpike.User') — an
   interactive MCP client (Flow A: OAuth Auth-Code + PKCE, a DELEGATED staff user) uses a normal
   staff token, so nothing below is on the shipping read path. The pieces here are the DESIGNED
   prerequisite bar for Phase 3b (autonomous agent WRITES): they let the Data API tell an app-only
   agent principal from a human and enforce that an agent may only ever perform non-destructive,
   non-humanOnly READS. They are NOT yet wired to any live agent write route.
   ============================================================ */

/** The autonomous-agent app-role (Flow B, client-credentials / app-only). Recognized but granted
 *  NO write today — an agent write route is a Phase-3b deliverable, gated on a signed-commit token. */
export const AGENT_ROLE = 'CollisionSpike.Agent';
/** Dedicated app-only role for the TKT-154 registration-bound image-ingest lane. */
export const IMAGE_INGEST_AGENT_ROLE = 'CollisionSpike.ImageIngest';

/**
 * True when the principal is an AUTONOMOUS agent: an app-only token (no `scp`/`preferred_username`
 * user identity) carrying the Agent app-role. A delegated staff user driving an MCP client (Flow A)
 * is NOT an agent — they carry a user identity.
 */
export function isAgentPrincipal(claims: JWTPayload): boolean {
  const roles = (claims.roles as string[] | undefined) ?? [];
  const hasUserIdentity =
    typeof (claims as Record<string, unknown>).scp === 'string' ||
    typeof (claims as Record<string, unknown>).preferred_username === 'string';
  return roles.includes(AGENT_ROLE) && !hasUserIdentity;
}

function hasDelegatedUserIdentity(claims: JWTPayload): boolean {
  return (
    typeof (claims as Record<string, unknown>).scp === 'string'
    || typeof (claims as Record<string, unknown>).preferred_username === 'string'
  );
}

/** The image-ingest role is valid only on an app-only token. A delegated staff token that
 * happens to carry the role is never promoted into the autonomous write lane. */
export function isImageIngestAgentPrincipal(claims: JWTPayload): boolean {
  const roles = (claims.roles as string[] | undefined) ?? [];
  return roles.includes(IMAGE_INGEST_AGENT_ROLE) && !hasDelegatedUserIdentity(claims);
}

export type McpPrincipalKind = 'readonly_staff' | 'image_ingest_agent';

/** Resolve the only two principals admitted to the MCP route. Staff must be delegated and
 * stay read-only; the dedicated app-only role sees only registration lookup + image ingest. */
export function mcpPrincipalKind(claims: JWTPayload): McpPrincipalKind | undefined {
  if (isImageIngestAgentPrincipal(claims)) return 'image_ingest_agent';
  const roles = (claims.roles as string[] | undefined) ?? [];
  if (
    hasDelegatedUserIdentity(claims)
    && (roles.includes('CollisionSpike.User') || hasSuperuser(roles))
  ) return 'readonly_staff';
  return undefined;
}

export interface CapabilityAuthzInput {
  kind: 'read' | 'write';
  destructive: boolean;
  humanOnly: boolean;
}
export interface CapabilityAuthzDecision {
  allow: boolean;
  reason?: string;
}

/**
 * PURE agent-capability authorization (the Phase-3b write prerequisite). An autonomous agent may
 * ONLY invoke non-destructive, non-humanOnly READ capabilities — every write and every
 * destructive/humanOnly capability is rejected for an agent (defence in depth alongside filtering
 * them from the agent tool surface). Human principals pass through here unchanged (their authz is
 * withRole + the write-tier gate). C1 in the verification matrix: an agent token can reach no
 * write/destructive capability.
 */
export function authorizeAgentCapability(
  cap: CapabilityAuthzInput,
  isAgent: boolean,
): CapabilityAuthzDecision {
  if (!isAgent) return { allow: true };
  if (cap.kind !== 'read') return { allow: false, reason: 'autonomous agents may not perform writes' };
  if (cap.destructive) return { allow: false, reason: 'destructive capabilities are human-only' };
  if (cap.humanOnly) return { allow: false, reason: 'this capability is human-only' };
  return { allow: true };
}
