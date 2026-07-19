# ADR-0029 — Staff identity is validated in-code with jose behind MSAL PKCE

**Status:** Proposed — pending operator approval (TKT-246).

## Decision

The staff web app signs users in with Microsoft Entra workforce identity using MSAL Browser v3 in the
Authorization-Code + PKCE public-client flow — [apps/web/src/auth/msalConfig.ts](../../apps/web/src/auth/msalConfig.ts).
The SPA is a public client: only the client id, tenant id, and API scope reach the browser bundle, no
secret does, and the token cache is `sessionStorage`. It acquires a delegated access token for the Data
API's `access_as_user` scope silent-first, falling back to a full-frame redirect on any silent-acquisition
failure so the app never dead-ends on a lapsed token.

The Data API validates the token itself, in process. Every Function registration is `authLevel:
'anonymous'` — the Functions host key is not the gate. On this delegated **staff** surface the Entra
bearer token is the gate; other anonymous surfaces carry their own credentials (public guided-capture a
capture bootstrap secret plus a short-lived access token, provider intake an `X-Api-Key`) and are out of
scope here.
[services/data-api/src/platform/auth/staff-auth.ts](../../services/data-api/src/platform/auth/staff-auth.ts)
verifies the `Authorization: Bearer` token with `jose` against the tenant JWKS (`createRemoteJWKSet` +
`jwtVerify`), pinning the issuer to the tenant's v2.0 endpoint and accepting both the bare client-id-GUID
audience that v2 access tokens carry and its `api://<id>` form. It then enforces the `roles` claim:
`CollisionSpike.User` for case work and `CollisionSpike.Superuser` for privileged actions, with Superuser
a superset of User. `withRole(...)` wraps each handler — a missing or invalid token is 401, an
authenticated caller lacking the role is 403.

Because the role rename is post-hoc, the legacy `CollisionSpike.Admin` value is still accepted as Superuser
so a cached pre-rename token cannot be locked out before it expires (TKT-138). `CollisionSpike.Engineer` is
a defined-but-unenforced reserved role. `ENTRA_TENANT_ID` and `API_AUDIENCE` are non-secret app settings.

## Rationale

This Function App does not enable App Service built-in authentication (Easy Auth): had it done so, Easy
Auth would validate the token and inject the client principal into request headers for any runtime — only
the convenience typed-principal binding is .NET-specific — but with it off the Node worker has no built-in
JWT validation, so validation lives in application code. Doing it with `jose` against the published JWKS
keeps the API self-contained and lets it separate an authentication failure from a server fault: a `jose`
`JOSEError` becomes a 401, which the SPA treats as an actionable authentication response — its per-request
token thunk re-acquires silently on the next request (there is no in-place retry of the 401'd call) — while
an error `jose` does not raise as a `JOSEError` (a connection-level JWKS failure, or a programming fault)
becomes a 500 rather than a misleading, non-retryable 401 — the shape that once turned a single-form
audience check into an "every page → 500" outage. This distinction is imperfect: a remote-JWKS timeout or
non-200 response is itself a `JOSEError` (`JWKSTimeout`) and today surfaces as a 401, not a 500. A
public-client PKCE SPA keeps every secret server-side, and the audience-plus-role check, not UI
visibility, is the real boundary.

## Consequences

Every externally reachable staff route must be wrapped in `withRole`: with `authLevel: 'anonymous'` an
unwrapped route would be unauthenticated, so the wrapper is a standing convention, not a structural
guarantee. The two-role model — User/Superuser plus the reserved Engineer and legacy-Admin acceptance — is
the vocabulary shared by the shared capability registry ([ADR-0025](./0025-shared-capability-registry.md)),
the delegated MCP read tier ([ADR-0023](./0023-mcp-server-hosting-and-auth.md)), and the operations
runbook ([identity-and-access](../operations/identity-and-access.md)); renaming a role id is a live
directory write that must keep unexpired tokens working, and audience handling must keep accepting both
token-version forms. This ADR covers the delegated **staff** surface only: the same module also carries the
app-only agent authorization helpers (`isAgentPrincipal`, `authorizeAgentCapability`), a designed but
not-yet-wired prerequisite governed by ADR-0023. Provider intake gates on a separate `X-Api-Key` shared
secret. Internal service-to-service routes, however, do **not** gate on a shared secret: `withServiceAuth`
calls the same `authenticate()` JWT verifier and currently admits any valid Entra token for the API
audience without checking its subject or app role — the unresolved P1 trust seam recorded in TKT-245.
Hardening it (a principal allowlist or a dedicated app role admitting the known managed-identity callers)
is pending TKT-245; until then that internal boundary is audience-only managed-identity bearer.

## Amendment — internal service-trust seam affirmed audience-only (2026-07-20)

Per [TKT-245](../tickets/done/TKT-245-service-trust-seam/TKT-245-service-trust-seam.md) (PLAN-008), the
internal `withServiceAuth` trust model is **decided: audience-only admission is affirmed**, and the two
divergent `withServiceAuth` implementations are consolidated to the single shared seam
(`services/data-api/src/features/inbound/internal/service-support.ts`; the `mirror-outbox-routes.ts` copy is
removed), with every authentication / unexpected-authentication / handler-failure status/body/logging
semantic preserved (`check:runtime-contract` stays clean).

The seam admits any token valid for the API's Entra audience with no subject/scp/app-role check. This is
**affirmed** (not a defect silently kept) because the API's audience is not a public-client audience — only
principals with an app-role assignment to the API can mint a token for it — and its two legitimate
managed-identity callers, the **orchestration** app and the **Archive (box-webhook) Function**, both hold
that assignment. Hardening to a principal (oid/appid) allowlist or a dedicated app-role admitting BOTH those
MSIs remains **operator-gated**: it changes live admission, and hardening for only one principal would break
the other. PLAN-006/PLAN-008's behaviour-preserving invariant forbids changing live admission here; the
hardening is future operator-authorised work tracked against this decision.
