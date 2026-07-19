---
id: PLAN-007
title: Shared server-runtime foundation
status: active
tickets: [TKT-247, TKT-248, TKT-249, TKT-250, TKT-251]
depends-on: [TKT-210]
---

# PLAN-007 — Shared server-runtime foundation

## Outcome

One server-only workspace package `@cs/server-runtime` (`packages/server-runtime`) becomes the single home
for the four runtime mechanisms currently hand-rolled across both TypeScript services: the managed-identity
token mint (nine copies today), the Data-API HTTP request core (four copies), one bounded-retry primitive
(none today), and the storage managed-identity token helper (three copies). Every prior call site imports the
shared implementation, a new ADR records why the server-only package is deliberately separate from
browser-safe `@cs/domain`, and a forbidden-pattern guard keeps the consolidation from regressing.

## Locked decisions

- The new package is **server-only and SDK-allowed** — the deliberate complement to browser-safe
  `@cs/domain`, whose README forbids runtime-adapter, database-client and cloud-SDK imports so the SPA can
  consume it. The two packages must never be merged; ADR-0031 records the boundary and the bundle-poisoning
  risk of collapsing it.
- Scope is **Node/TypeScript only**. The Python "independently packaged" doctrine is out of scope and owned
  by PLAN-011; no cross-language sharing is attempted here.
- Consolidation is **behaviour-preserving**. The nine token-mint copies are near-identical but not byte
  identical; the real differences become explicit parameters, not silent changes: one site threads an
  `AbortSignal` (box-maintenance adapter), two carry an `az`-CLI dev-token fallback (the two cognitive-audience
  mints), and the token-absent fallback cache TTL differs (fifty-five versus fifty minutes). The sixty-second
  expiry skew is uniform across all nine and stays fixed.
- **No** route, request/response shape, authentication behaviour, resource name, or numeric-code change (the
  PLAN-006 locked invariant; PLAN-008 owns route and trust changes).
- `graph.ts` is **excluded**: its token is client-credentials against Entra (`login.microsoftonline.com`),
  not an `IDENTITY_ENDPOINT` managed-identity mint, and its loops are pagination guards, not retry. The single
  storage SAS builder (`blob-store.ts`) is co-located with the storage helper but is **not** a
  de-duplication target — it exists exactly once.
- Every migration reports a net file/LOC delta per PR and the plan must be **net-negative** overall (nine
  mint copies to one, minus the new package's fixed cost).

## Sequence

1. TKT-247 scaffolds `packages/server-runtime` (workspace wiring, build, test harness, ownership README) and
   authors ADR-0031; no runtime behaviour changes.
2. TKT-248 consolidates the managed-identity token mint into one `getManagedIdentityToken(audience, options)`
   with a shared `{value, expiresAt}` cache and migrates all nine sites, preserving the AbortSignal,
   dev-fallback and cache-TTL differences as explicit options.
3. TKT-249 consolidates the Data-API HTTP request core and adds one bounded-retry primitive (honours
   `Retry-After`, exponential backoff with jitter, finite count, explicit retryable status set), routing the
   four wrappers and the inline chat-client retry through it.
4. TKT-250 consolidates the storage managed-identity token helper across its three sites; the single SAS
   builder moves with it unchanged.
5. TKT-251 adds the AST/import-aware forbidden-pattern guard asserting `IDENTITY_ENDPOINT` and the
   storage-audience mint appear only inside `packages/server-runtime`, wired into `verify-all.mjs`.

## Gates

- Hard dependency: PLAN-006 **TKT-210** (source decomposition) must reach `verify` before TKT-248's migration
  lands. TKT-210 decomposes the same `services/*/src` trees this plan refactors; refactoring underneath an
  in-flight decomposition is the series' top collision risk. TKT-210 is currently in `now`.
- ADR numbering: this series starts new ADRs at **0031** (authored by TKT-247). The 0026–0030 range is
  reserved by TKT-246 (platform ADR backfill, currently `backlog`). ADR-0031 does **not** cite 0026–0030 and
  does **not** depend on them existing; if TKT-247 lands first, the temporary 0026–0030 numbering gap is
  acceptable (ADR IDs need not be contiguous — cf. 0017 Withdrawn). This is a numbering reservation, not a
  build gate.

## Close-out

The plan closes only when all members are `done`: the four mechanisms live once in `@cs/server-runtime`,
every prior call site imports them, `check:runtime-contract` shows routes and shapes unchanged, both
TypeScript services build and their bundles smoke-load, `check:production-dependencies` proves the package
never reaches the SPA path, the aggregate net file/LOC delta is negative, and the drift guard fails a
synthetic re-introduction of `IDENTITY_ENDPOINT` outside the package. No member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/5 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 5 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-247](../backlog/TKT-247-server-runtime-scaffold-and-boundary/TKT-247-server-runtime-scaffold-and-boundary.md) | backlog | Scaffold the server-runtime package and record its boundary |
| [TKT-248](../backlog/TKT-248-managed-identity-token-mint-consolidation/TKT-248-managed-identity-token-mint-consolidation.md) | backlog | Consolidate the managed-identity token mint across all nine sites |
| [TKT-249](../backlog/TKT-249-data-api-http-wrapper-and-retry-primitive/TKT-249-data-api-http-wrapper-and-retry-primitive.md) | backlog | Consolidate the Data-API HTTP core and add one bounded-retry primitive |
| [TKT-250](../backlog/TKT-250-storage-managed-identity-token-helper/TKT-250-storage-managed-identity-token-helper.md) | backlog | Consolidate the storage managed-identity token helper |
| [TKT-251](../backlog/TKT-251-server-runtime-forbidden-pattern-guard/TKT-251-server-runtime-forbidden-pattern-guard.md) | backlog | Add the server-runtime forbidden-pattern drift guard |
<!-- /GENERATED:PROGRESS -->
