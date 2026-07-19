---
id: PLAN-008
title: Canonical service routes
status: active
tickets: [TKT-245, TKT-262, TKT-263, TKT-264, TKT-265, TKT-266]
depends-on: [PLAN-007, TKT-246]
---

# PLAN-008 — Canonical service routes

## Outcome

One canonical path per capability: one Python-function client built on PLAN-007's primitives, a decided and
documented internal-trust model, the internal MSI route surface consolidated, and the outbox-drain pattern
expressed once — with every dark/gated lane preserved exactly.

## Locked decisions

- **Forced order.** Each step depends on the one before. T8 — the internal-trust decision (TKT-245) — is
  step 1, because consolidating the internal routes behind an undecided trust seam would mean rebuilding the
  surface once T8 lands.
- **Dark lanes are authority-gated, not dead.** `LIVE_FACTS.json` `safetyGates` / `deliberatelyUnavailable`
  is the authority: the read-only MCP lane, MCP image ingestion, capture (public capture + cleanup),
  EVA-submission, and outlook-move may be **moved mechanically** during consolidation, but a gate or handler
  is **never removed**. The MCP surface itself is out of scope — the AI-realignment axis owns it. (Note: there
  is no `sent-items` gate; MCP is split into an enabled read-only lane and a gated image-ingestion lane.)
- **No behaviour change.** Routes, request/response shapes, authentication semantics, and resource names are
  unchanged (PLAN-006 locked invariant + `check:runtime-contract`).
- **Built on PLAN-007.** The clients and adapters migrate onto the `@cs/server-runtime` primitives.
- **Finding D nuance.** The Box SDK / token mint is single-site (inside the `box-webhook` Python function);
  the duplication is the two TypeScript client **facades** over that function's routes, which collapse with the
  single Python-function client (finding C) — not a duplicated SDK.

## Sequence

1. TKT-245 (adopted, T8) decides and hardens the internal-trust model and consolidates the two
   `withServiceAuth` seams into one — the forced first step.
2. TKT-262 collapses the two Python-function clients (`functions-client.ts` and `service-client.ts`) onto the
   `@cs/server-runtime` primitives and moves the shared request/response types into `contracts/`; the Box
   facade duplication (D) falls out.
3. TKT-263 consolidates the eleven internal-MSI route modules behind `register-internal-routes.ts` (including
   the four `cases/` splits) behind the T8-decided seam; inline single-caller granularity rather than
   re-wrapping.
4. TKT-264 generalises the outbox drain — the three copies (archive-mirror, provider-archive, and the
   box-file-request lane whose monitor and adapter are filed under the `box-maintenance-*` name) collapse to
   one drain plus a target registry; it waits on the outbox/generation-counter reliability ADR (expected
   ADR-0030) from TKT-246 so it amends a decision of record rather than racing it.
5. TKT-265 dedups the BFF proxy — `proxy-routes.ts` re-exposes parser and location-suggest that orchestration
   reaches directly; settle one canonical path per capability once the SPA-transport migration is confirmed.
6. TKT-266 adds the route/authority-inventory guard: one registered path per capability, failing on two
   authoritative writers for a transition, an unowned route, or a second local auth helper claiming the same
   policy.

## Gates

- **PLAN-007** — the shared `@cs/server-runtime` primitives the clients and adapters migrate onto.
- **T8 / TKT-245** — the trust decision is the forced first step; the rest of the surface consolidates behind it.
- **TKT-246** — step 4 (outbox generalisation) waits on the outbox-reliability ADR (expected ADR-0030) from
  the platform backfill; the number is not pre-assigned.

## Close-out

The plan closes only when all members are `done`: one Python-function client on the shared primitives with its
contract types in `contracts/`, one internal-trust seam, the internal MSI surface consolidated, one outbox
drain plus a target registry, one canonical path per capability, and the route/authority guard failing a
synthetic duplicate path or second auth helper. `check:runtime-contract` shows routes, shapes, and auth
unchanged; the dark-lane gates tests still pass (no gate removed); the aggregate net file/LOC delta is
negative; and full `node verify-all.mjs` is green. No member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/6 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 6 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-245](../backlog/TKT-245-service-trust-seam/TKT-245-service-trust-seam.md) | backlog | Decide and harden the internal service-trust seam (withServiceAuth) |
| [TKT-262](../backlog/TKT-262-one-python-function-client/TKT-262-one-python-function-client.md) | backlog | Collapse the two Python-function clients onto one |
| [TKT-263](../backlog/TKT-263-internal-msi-route-consolidation/TKT-263-internal-msi-route-consolidation.md) | backlog | Consolidate the internal MSI route surface behind the trust seam |
| [TKT-264](../backlog/TKT-264-outbox-drain-generalisation/TKT-264-outbox-drain-generalisation.md) | backlog | Generalise the outbox drain to one drain plus a target registry |
| [TKT-265](../backlog/TKT-265-bff-proxy-canonicalisation/TKT-265-bff-proxy-canonicalisation.md) | backlog | Canonicalise the BFF proxy lane |
| [TKT-266](../backlog/TKT-266-route-authority-inventory-guard/TKT-266-route-authority-inventory-guard.md) | backlog | Add the route and authority inventory guard |
<!-- /GENERATED:PROGRESS -->
