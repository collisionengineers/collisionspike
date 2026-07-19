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
token mint (nine hand-rolled copies — six bearer-token sites and three storage-audience sites), the Data-API
HTTP request core (four copies), one bounded-retry primitive (none today), and the storage managed-identity
token helper (the three storage-audience sites above, wrapped for the storage-SDK `TokenCredential` shape).
Every prior call site imports the shared implementation, a new ADR records why the server-only package is
deliberately separate from browser-safe `@cs/domain`, and a forbidden-pattern guard keeps the consolidation
from regressing.

## Locked decisions

- The new package is **server-only and SDK-allowed** — the deliberate complement to browser-safe
  `@cs/domain`, whose README forbids runtime-adapter, database-client and cloud-SDK imports so the SPA can
  consume it. The two packages must never be merged; ADR-0031 records the boundary and the bundle-poisoning
  risk of collapsing it.
- Scope is **Node/TypeScript only**. The Python "independently packaged" doctrine is out of scope and
  deferred to a later plan in this architecture-simplification series (reserved as PLAN-011, not yet
  authored); no cross-language sharing is attempted here.
- Consolidation is **behaviour-preserving**. The nine token-mint copies are near-identical but not byte
  identical; the real differences become explicit parameters, not silent changes: one site threads an
  `AbortSignal` (box-maintenance adapter), two carry an `az`-CLI dev-token fallback (the two cognitive-audience
  mints), the four Data-API adapters honour a `DATA_API_TOKEN` local-token override for off-Azure runs
  (`func start`), the storage mint attaches `statusCode`/`code: 'ManagedIdentityTokenError'` retry metadata
  that evidence backfill consumes, and the token-absent fallback cache TTL differs (fifty-five versus fifty
  minutes). The sixty-second expiry skew is uniform across all nine and stays fixed. Each of these is a named
  acceptance criterion in its owning ticket, not a silent normalisation.
- **No** route, request/response shape, authentication behaviour, resource name, or numeric-code change (the
  PLAN-006 locked invariant; route and trust changes are deferred to a later plan in this series, reserved as
  PLAN-008).
- `graph.ts` is **excluded**: its token is client-credentials against Entra (`login.microsoftonline.com`),
  not an `IDENTITY_ENDPOINT` managed-identity mint, and its loops are pagination guards, not retry. The single
  capture SAS builder (`createCaptureUploadSas` in `evidence/blob-store.ts`) is **not** a de-duplication
  target — it exists exactly once and stays **feature-owned** (a security policy, per the reconciled review);
  only credential/client construction is shared.
- Every migration reports a net file/LOC delta per PR and the plan must be **net-negative** overall (nine
  mint copies to one, minus the new package's fixed cost).

## Sequence

1. TKT-247 scaffolds `packages/server-runtime` (workspace wiring, build, test harness, ownership README) and
   authors ADR-0031; no runtime behaviour changes.
2. TKT-248 consolidates the managed-identity token mint into one `getManagedIdentityToken(audience, options)`
   with a shared `{value, expiresAt}` cache and migrates the **six bearer-token sites**, preserving the
   `AbortSignal`, `az`-CLI dev-fallback, `DATA_API_TOKEN` local override and cache-TTL differences as explicit
   options. The three storage-audience sites migrate onto the same primitive in TKT-250 — no site is migrated
   twice.
3. TKT-249 consolidates the Data-API HTTP request core and adds one bounded-retry primitive (honours
   `Retry-After`, exponential backoff with jitter, finite count, explicit retryable status set, and a
   caller-supplied retry predicate for non-HTTP callers), routing the four wrappers and the inline chat-client
   tool retry through it while preserving each wrapper's existing observable error contract.
4. TKT-250 migrates the **three storage-audience sites** onto the shared primitive through a thin
   storage-shape wrapper, preserving the `ManagedIdentityTokenError` retry metadata that evidence backfill
   consumes. The single capture SAS builder stays feature-owned in `features/evidence/blob-store.ts` (the
   reconciled review classifies it as a security policy, not a shared mechanism); only credential/client
   construction is shared.
5. TKT-251 adds the AST/import-aware forbidden-pattern guard asserting that the managed-identity mint surface —
   both the raw `IDENTITY_ENDPOINT` / storage-audience mint and the `@azure/identity` SDK mint
   (`ManagedIdentityCredential` / `DefaultAzureCredential`) — appears only inside `packages/server-runtime`,
   wired into `verify-all.mjs`.

## Gates

- Hard dependency: PLAN-006 **TKT-210** (source decomposition) must reach `verify` before TKT-248's migration
  lands. TKT-210 decomposes the same `services/*/src` trees this plan refactors; refactoring underneath an
  in-flight decomposition is the series' top collision risk. TKT-210 is now `done` (landed via PR #117),
  so this hard dependency is satisfied.
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
synthetic re-introduction of a managed-identity mint (raw `IDENTITY_ENDPOINT` or `@azure/identity` SDK)
outside the package. No member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**5/5 done (100%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 5 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-247](../done/TKT-247-server-runtime-scaffold-and-boundary/TKT-247-server-runtime-scaffold-and-boundary.md) | done | Scaffold the server-runtime package and record its boundary |
| [TKT-248](../done/TKT-248-managed-identity-token-mint-consolidation/TKT-248-managed-identity-token-mint-consolidation.md) | done | Consolidate the managed-identity token mint across the six bearer-token sites |
| [TKT-249](../done/TKT-249-data-api-http-wrapper-and-retry-primitive/TKT-249-data-api-http-wrapper-and-retry-primitive.md) | done | Consolidate the Data-API HTTP core and add one bounded-retry primitive |
| [TKT-250](../done/TKT-250-storage-managed-identity-token-helper/TKT-250-storage-managed-identity-token-helper.md) | done | Consolidate the storage managed-identity token helper |
| [TKT-251](../done/TKT-251-server-runtime-forbidden-pattern-guard/TKT-251-server-runtime-forbidden-pattern-guard.md) | done | Add the server-runtime forbidden-pattern drift guard |
<!-- /GENERATED:PROGRESS -->
