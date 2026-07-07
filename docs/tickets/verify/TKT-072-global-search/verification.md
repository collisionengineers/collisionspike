# Verification — TKT-072: The search box doesn't search — global search across cases, emails, providers

## Verdict
TESTED (offline)

## Evidence
- `api/src/functions/search.test.ts` — query shaping, short-query guard, per-group caps, honest-empty.
- SPA build + suite green; `node verify-all.mjs` API + SPA gates green.

## Pending / gaps
- Built DARK: `GLOBAL_SEARCH_ENABLED` defaults **off**; the route 404s and the SPA view is unreachable
  until flipped.
- **Not deployed.** Live proof (`/api/search?q=` with a valid token returns grouped JSON; without a token
  → 401; same-VRM grouping visible in the SPA) is pending the operator flip in
  [docs/gated.md](../../../gated.md) (§F) after a soak.

## How to re-verify
Offline: `npm --prefix api test`, `npm --prefix mockup-app test`. Live (after flip): call `/api/search?q=<vrm>`
with and without a bearer token; exercise the SPA search box and confirm same-VRM grouping.
