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

## Addendum — final wave D2 (2026-07-09): verifier findings folded in

Two acceptance details the live verifier flagged, shipped in the D2 batch (same api + SPA deploys):

1. **Case rows now show AGE.** `GET /api/search` case hits gained `createdAt` (ISO;
   `api/src/functions/search.ts` — SELECT includes `c.created_at`; +1 route test pinning the field
   and the null-tolerant mapping). The SPA renders a plain age on case rows ("12d old" / "today")
   via new pure helpers `ageDaysFromIso`/`caseAgeLabel` in `mockup-app/src/components/date-format.ts`
   (calendar-day semantics matching the queue rows; nothing rendered when the field is absent).
2. **Email hits open THE ITEM, not the bare inbox.** `SearchResults.tsx` email rows navigate to
   `/inbox?item=<inbound email id>`; the Inbox honors the param via a one-shot effect (new pure
   `mockup-app/src/screens/inbox-deep-link.ts` + 7 tests): once the list loads it opens that row's
   preview and strips the param; an unknown/stale id degrades silently to the plain inbox.

SPA suite 24 files / 353 tests green; api suite green incl. the new search test.
