# 01 — Shared server-runtime foundation → PLAN-007

**Status: non-binding working draft. Superseded on distillation.**
Distils into **PLAN-007**. New ADR: **0031** (server-runtime package boundary). Validated against
`main` at `de9c3f9d`.

## Problem

The single highest-leverage duplication in the repo is finding **A**: the managed-identity token mint is
hand-rolled ~9 times across both TypeScript services, several copies openly commented "mirrors
`lib/data-api.ts`". Around it cluster the Data-API HTTP request wrapper (B, 4 copies), the absence of any
retry primitive (F), and the storage MI-token / SAS helper (G, 2–3 copies). These share one root cause:
**there is no server-only shared package.** `@cs/domain` (`packages/domain`) is deliberately browser-safe
and SDK-free (its README forbids Node/Azure SDK imports so the SPA can consume it), so it cannot host
runtime plumbing. Every service therefore re-implements the same four mechanisms.

This is the purest drift engine in the codebase: nine copies of a security-sensitive token cache means a
correctness or expiry fix lands in one and silently skips eight.

## Outcome

One server-only workspace package (working name `packages/server-runtime`, `@cs/server-runtime`) that is
the **single home** for: the MI token mint, the Data-API HTTP request wrapper, one bounded-retry
primitive, and the storage MI-token + SAS helper. Every call site migrates onto it. A forbidden-pattern
guard makes the consolidation permanent.

## Scope

**In:**
- New package `packages/server-runtime`, explicitly server-only and SDK-allowed — the deliberate
  complement to browser-safe `@cs/domain`. The new ADR **0031** records this boundary and *why* the split
  exists (so a future agent doesn't "simplify" the two packages back together and poison the SPA bundle).
- Extract and migrate finding **A** (token mint) across all 9 sites.
- Extract and migrate finding **B** (request wrapper) — the shared `request()`/`post()` core only; the
  narrow outbox tails stay with their adapters (those move in PLAN-008).
- Add finding **F** (one bounded-retry primitive, TS) and route the existing hand-rolled retry loops in
  `graph.ts` / the adapters through it.
- Extract and migrate finding **G** (storage MI-token + SAS helper).
- Final ticket: a `check:forbidden`-style guard asserting `IDENTITY_ENDPOINT` (and the storage-audience
  mint) appear **only** inside `packages/server-runtime`.

**Out (locked decisions):**
- The Python "independently packaged" doctrine is untouched here — quarantined to **PLAN-011**. This
  package is Node-only.
- `aoai.ts` and `chat-client.ts` receive **mint-extraction only, zero interface change.** The
  AI-realignment axis owns any model-gateway restructure and will consume this same helper later.
- No route, request/response shape, auth behaviour, or resource name changes (that is PLAN-008 / the
  PLAN-006 locked invariant).

## Proposed tickets (IDs from the free range at mint time — rescan; ~5)

1. **Scaffold `packages/server-runtime`** — workspace wiring, build, test harness, README (ownership /
   contract / callers / tests), and ADR **0031**. Server-only; depends on nothing runtime.
2. **Token mint** — one `getManagedIdentityToken(audience)` with the `{value, expiresAt}` cache; migrate
   all 9 sites (finding A). Largest ticket; touches both services.
3. **Request wrapper + retry** — the shared `request()`/`post()` core (B) plus the bounded-retry
   primitive (F); route `graph.ts` and the adapters through it.
4. **Storage helper** — `storageMiToken()` + SAS helper (G); migrate `blob.ts`, `blob-store.ts`,
   `outlook-queue.ts`.
5. **Drift guard** — the forbidden-pattern check + its unit test; wire into `verify-all.mjs`.

## Dependencies / gates

- **Plan 0** — cite the corrected ADR corpus; 0031 slots after T9's reserved 0026–0030.
- **PLAN-006 TKT-210 (source decomposition) must reach `verify` first.** TKT-210 is currently in `now` and
  decomposes the same `services/*/src` trees this plan refactors. Refactoring underneath an in-flight
  decomposition is the top collision risk in the series. This is a hard `depends-on` edge.

## Risks

- **Bundle poisoning** — if the new package leaks into the SPA path, browser builds break. Mitigation: the
  package is imported only by `services/*`; add a production-dependency-boundary assertion (the repo
  already runs `check:production-dependencies`).
- **Token-cache semantics drift during extraction** — the 9 copies are near-identical but *not* byte
  identical (some carry an `AbortSignal`, some a different early-expiry margin). Mitigation: diff all 9
  before extracting; make the differences explicit parameters, not silent behaviour changes; unit-test the
  cache boundary.
- **PLAN-006 rebase churn** — nine verify tickets can bounce back with structural fixes. Mitigation: the
  TKT-210 gate; land ticket 2 (the big migration) in one focused PR to minimise the rebase window.

## Verification

- `check:runtime-contract` proves routes / shapes unchanged.
- Net **file and LOC delta reported per PR** — this plan must be net-negative overall (nine mint copies →
  one, minus the new package's fixed cost).
- Full `node verify-all.mjs` before push; both TS services build and their bundles smoke-load.
- The drift guard fails a synthetic re-introduction of `IDENTITY_ENDPOINT` outside the package.
