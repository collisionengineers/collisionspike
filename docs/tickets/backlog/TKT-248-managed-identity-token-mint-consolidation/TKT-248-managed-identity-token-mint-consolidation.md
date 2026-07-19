---
id: TKT-248
title: Consolidate the managed-identity token mint across all nine sites
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-210, TKT-247, TKT-249, TKT-250, TKT-251]
research-link: docs/tickets/backlog/TKT-248-managed-identity-token-mint-consolidation/evidence/distillation-note.md
plan: PLAN-007
---

# Consolidate the managed-identity token mint across all nine sites

## Problem
The managed-identity token mint is hand-rolled nine times across both TypeScript services — a correctness or
expiry fix must be made in one place and is silently skipped in eight. Each copy reads `IDENTITY_ENDPOINT` /
`IDENTITY_HEADER`, calls the App Service MSI endpoint (`api-version=2019-08-01`, header `X-IDENTITY-HEADER`),
and caches a `{value, expiresAt}` pair. This is the single highest-leverage duplication in the repository.

## Evidence
Nine independent mints verified read-only on 2026-07-19 (six in orchestration, three in data-api). They are
near-identical but not byte identical: exactly one threads an `AbortSignal` (the box-maintenance adapter), two
carry an `az`-CLI dev-token fallback (the two cognitive-audience mints), and the token-absent fallback cache
TTL differs (fifty-five versus fifty minutes); the sixty-second expiry skew is uniform. One copy (the `aoai`
cognitive mint) carries a stale `mirrors lib/data-api.ts` comment — that path does not exist; the real
canonical is `services/orchestration/src/adapters/data-api-http.ts`. Exact file/line inventory is in the research link.

## Proposed change
Introduce one `getManagedIdentityToken(audience, options)` in `@cs/server-runtime` with the shared
`{value, expiresAt}` cache keyed by audience, exposing the genuine per-site differences as explicit options
(`signal?`, `devTokenFallback?`, `fallbackTtlMs?`). Prefer wrapping the `@azure/identity` credential over the
raw endpoint where feasible, reusing a single credential instance (Microsoft's guidance to avoid Entra 429s).
Migrate all nine sites to it and delete the local copies. Correct the stale `lib/data-api.ts` comments.

## Acceptance
- **A1.** A single `getManagedIdentityToken(audience, options)` exists in `@cs/server-runtime`, with a
  cache-boundary unit test covering hit, near-expiry refresh, and the fallback-TTL and dev-token paths.
- **A2.** All nine former mint sites import it and contain no local token-mint implementation; the AbortSignal,
  dev-fallback and cache-TTL behaviours are preserved via options, proven by tests.
- **A3.** `graph.ts` is unchanged (its client-credentials Entra token is out of scope).
- **A4.** Routes, DTO shapes, authentication behaviour and resource names are unchanged
  (`check:runtime-contract` clean); both services build and their bundles smoke-load.
- **A5.** The net file/LOC delta for this ticket is negative.
- **A6.** No live deployment or cloud write.

## Validation
- Diff all nine copies before extraction; run the cache-boundary unit tests and both service test suites;
  compare route/DTO/auth snapshots before and after; report the file/LOC delta.
- Full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (finding A) with the nine-site inventory, the AbortSignal /
dev-fallback / cache-TTL variations, and the stale-comment correction re-verified read-only on 2026-07-19
(`PLAN-007.dossier`); Microsoft Learn guidance on MI token acquisition and credential reuse cited there.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
