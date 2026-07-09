# Changes — TKT-072: The search box doesn't search — global search across cases, emails, providers

## Status
verify — **GATE FLIPPED LIVE 2026-07-09** (PLAN-003 final wave D1, operator-granted):
`GLOBAL_SEARCH_ENABLED=true` on `cespk-api-dev`, readback-proven; unauthenticated
`GET /api/search?q=…` → **401 fail-closed** proven live (an API-audience token can't be
minted headlessly — AADSTS65001). Remaining proof: an authenticated `/search` render from
an operator/verifier SPA session. Registry:
[live-environment.md](../../../architecture/live-environment.md).
Under [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 (global search endpoint + SPA results view).

## Files touched
- `api/src/functions/search.ts` (+ `search.test.ts`) — `GET /api/search?q=` across `case_`,
  `inbound_email`, `work_provider` using `canonicalizeVrm`; honest-empty, per-group caps, short-query guard;
  gated by `GLOBAL_SEARCH_ENABLED`. Route registered in `api/src/index.ts`.
- `mockup-app/src/screens/SearchResults.tsx`, `components/AppShell.tsx` (SearchBox → `/search`),
  `routes.tsx` (`/search` route), `data/rest-client.ts` + `data/mock-source.ts` (`globalSearch`).
- `packages/domain/src/gates.ts` — `GLOBAL_SEARCH_ENABLED` gate (default off).

## Summary
The header search box was inert. A gated `GET /api/search` returns capped, same-VRM-grouped hits across
cases, emails, and providers (canonical VRM matching), and the SPA renders them in a results view. Gated
behind `GLOBAL_SEARCH_ENABLED` for a soak before flip.
