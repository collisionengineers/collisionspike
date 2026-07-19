---
id: TKT-248
title: Consolidate the managed-identity token mint across the six bearer-token sites
status: done
priority: P1
area: platform
tickets-it-relates-to: [TKT-210, TKT-247, TKT-249, TKT-250, TKT-251]
research-link: docs/tickets/done/TKT-248-managed-identity-token-mint-consolidation/evidence/distillation-note.md
plan: PLAN-007
---

# Consolidate the managed-identity token mint across the six bearer-token sites

## Problem
The managed-identity token mint is hand-rolled nine times across both TypeScript services — a correctness or
expiry fix must be made in one place and is silently skipped in eight. Each copy reads `IDENTITY_ENDPOINT` /
`IDENTITY_HEADER`, calls the App Service MSI endpoint (`api-version=2019-08-01`, header `X-IDENTITY-HEADER`),
and caches a `{value, expiresAt}` pair. This is the single highest-leverage duplication in the repository.
This ticket owns the primitive and the **six bearer-token sites**; the **three storage-audience sites**
migrate onto the same primitive in TKT-250, so no site is migrated twice.

## Evidence
Nine independent mints verified read-only on 2026-07-19; six mint a bearer string (data-api, provider-archive,
archive-mirror, box-maintenance, and the two cognitive `aoai` / `chat-client` mints) and three mint the
storage audience (`platform/blob.ts`, `evidence/blob-store.ts`, `inbound/outlook-queue.ts` — owned by
TKT-250). They are near-identical but not byte identical: exactly one threads an `AbortSignal` (the
box-maintenance adapter), two carry an `az`-CLI dev-token fallback (the two cognitive-audience mints), the
four Data-API adapters (`data-api-http.ts:8-9`, `provider-archive-api.ts:19`, `archive-mirror-api.ts:19`,
`box-maintenance-api.ts:11`) return `process.env.DATA_API_TOKEN` verbatim before any managed-identity call so
`func start` works off Azure, and the token-absent fallback cache TTL differs (fifty-five versus fifty
minutes); the sixty-second expiry skew is uniform. One copy (the `aoai` cognitive mint) carries a stale
`mirrors lib/data-api.ts` comment — that path does not exist; the real canonical is
`services/orchestration/src/adapters/data-api-http.ts`. Exact file/line inventory is in the research link.

## Proposed change
Introduce one `getManagedIdentityToken(audience, options)` in `@cs/server-runtime` with the shared
`{value, expiresAt}` cache keyed by audience, exposing the genuine per-site differences as explicit options
(`signal?`, `devTokenFallback?`, `localTokenEnv?` for the `DATA_API_TOKEN` off-Azure override, `fallbackTtlMs?`).
On a failed mint the primitive surfaces the HTTP status (it does not collapse the failure into an opaque
error) so audience wrappers — notably the storage wrapper in TKT-250 — can classify a transient
throttling/outage from a terminal configuration fault. Prefer wrapping the `@azure/identity` credential over
the raw endpoint where feasible, reusing a single credential instance (Microsoft Learn guidance to avoid
Entra-side HTTP 429s). Migrate the six bearer-token sites to it and delete their local copies. Correct the
stale `lib/data-api.ts` comment.

## Acceptance
- **A1.** A single `getManagedIdentityToken(audience, options)` exists in `@cs/server-runtime`, with a
  cache-boundary unit test covering hit, near-expiry refresh, and the fallback-TTL and dev-token paths, and it
  surfaces the mint HTTP status on failure for audience wrappers to classify.
- **A2.** All six bearer-token mint sites import it and contain no local token-mint implementation; the
  `AbortSignal`, `az`-CLI dev-fallback, **`DATA_API_TOKEN` local override**, and cache-TTL behaviours are
  preserved via options, proven by tests (including a test that the override is returned before any MI call).
- **A3.** `graph.ts` is unchanged (its client-credentials Entra token is out of scope); the three
  storage-audience sites are out of scope here and owned by TKT-250.
- **A4.** Routes, DTO shapes, authentication behaviour and resource names are unchanged
  (`check:runtime-contract` clean); both services build and their bundles smoke-load.
- **A5.** The net file/LOC delta for this ticket is negative.
- **A6.** No live deployment or cloud write.

## Validation
- Diff all nine copies before extraction; run the cache-boundary unit tests and both service test suites;
  compare route/DTO/auth snapshots before and after; report the file/LOC delta.
- Full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (finding A). The nine-site inventory (six bearer-token, three
storage-audience), the `AbortSignal` / dev-fallback / `DATA_API_TOKEN` / cache-TTL variations, and the
stale-comment correction were re-verified read-only on 2026-07-19; the site-by-site inventory and the
Microsoft Learn grounding (MI token acquisition, single-credential reuse to avoid Entra 429s) are recorded in
the [distillation note](./evidence/distillation-note.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
