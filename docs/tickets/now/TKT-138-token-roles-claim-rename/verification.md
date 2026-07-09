# Verification — TKT-138: token roles-claim rename reconcile

## Verdict
PENDING

## Evidence
- Read-only enumeration outputs summarised in [changes.md](./changes.md): app appRoles ==
  SP appRoles == Engineer/User/Superuser (Superuser id 5b356d4c); the operator's only API
  appRoleAssignment targets 5b356d4c; the SPA app defines no appRoles.
- Code check: `api/src/lib/auth.ts` `SUPERUSER_VALUES` deliberately accepts BOTH
  `CollisionSpike.Superuser` and legacy `CollisionSpike.Admin` (now documented with the
  root-cause record); `withRole` authorizes either as superuser — no regression path.

## Pending / gaps
- The fresh-token claim read: `az` cannot mint an API-audience staff token (AADSTS65001),
  so the final acceptance line needs ONE operator action — from the signed-in SPA, copy
  the current access token (DevTools → Network → any `/api/*` request → Authorization
  header) and decode its payload; `roles` must read `["CollisionSpike.Superuser"]`.
  If a genuinely fresh sign-in still reads `.Admin`, that contradicts the directory
  enumeration and should be escalated (Microsoft support), but nothing observed predicts it.

## How to re-verify
1. Fresh SPA sign-in (or token refresh) → decode the Bearer token → `roles` claim.
2. Re-run the three read-only enumerations in changes.md; all three must still agree.
