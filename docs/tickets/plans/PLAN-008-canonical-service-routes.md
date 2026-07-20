---
id: PLAN-008
title: Canonical service routes
status: active
tickets: [TKT-245, TKT-262, TKT-263, TKT-264, TKT-265, TKT-266]
depends-on: [PLAN-007]
---

# PLAN-008 — Canonical service routes

## Outcome

One explicit authority and delegation chain per capability and caller lane: one shared server-only client for
the actively used focused-Function calls, a decided and documented internal-trust model, the complete internal
MSI registration surface accounted for behind that model, and shared Durable-monitor lifecycle plumbing where
the three outbox lanes genuinely match. Every distinct outbox protocol and every dark/gated lane remains intact.

## Locked decisions

- **Trust before route consolidation.** T8 — the internal-trust decision (TKT-245) — precedes TKT-263 and
  TKT-264 because those tickets touch routes behind that seam. Dead-client cleanup and the focused-Function
  client consolidation do not pretend to depend on an unrelated authentication decision.
- **Dark lanes are authority-gated, not dead.** `LIVE_FACTS.json` `safetyGates` / `deliberatelyUnavailable`
  is the authority: the read-only MCP lane, MCP image ingestion, capture (public capture + cleanup),
  EVA-submission, and outlook-move may be **moved mechanically** during consolidation, but a gate or handler
  is **never removed**. The MCP surface itself is out of scope — the AI-realignment axis owns it. (Note: there
  is no `sent-items` gate; MCP is split into an enabled read-only lane and a gated image-ingestion lane.)
- **No behaviour or configuration-name change.** Routes, request/response shapes, authentication semantics,
  Durable instance/orchestrator/activity names, resource names, and existing app-setting names are unchanged
  (PLAN-006 locked invariant + `check:runtime-contract`). Shared client code receives service-owned target
  configuration; it does not force a live app-setting migration or add legacy dual-read fallbacks.
- **Built on PLAN-007.** The clients and adapters migrate onto the `@cs/server-runtime` primitives.
- **Contract ownership stays canonical.** Root `contracts/` remains reserved for external wire schemas.
  Internal TypeScript DTOs stay with the shared server client or in browser-safe `@cs/domain` when they are
  genuinely cross-runtime domain contracts.
- **Finding D nuance.** The Box SDK / token mint is single-site (inside the `box-webhook` Python function);
  the duplication is the two TypeScript client **facades** over that function's routes, which collapse with the
  single Python-function client (finding C) — not a duplicated SDK.
- **The outbox protocols are not one protocol.** Archive mirror and provider Archive expose
  pending/complete/defer generation protocols. File Request exposes one API-owned atomic drain. TKT-264 may
  share only their Durable wake/retry/reschedule/bootstrap lifecycle; it must not flatten these distinct
  correctness boundaries into a generic data-plane drain.

## Sequence

1. TKT-245 (adopted, T8) inventories every legitimate managed-identity caller, decides the internal-trust
   model, and consolidates the two `withServiceAuth` implementations without changing handler error semantics.
2. TKT-265 proves the staff BFF routes are the active parser/location entrypoints and removes the unused
   orchestration `callParser` / `callLocationSuggest` exports; no working BFF route is removed.
3. TKT-262 consolidates the remaining actively used portions of `functions-client.ts` and `service-client.ts`
   into an owned `@cs/server-runtime` client module. Each service injects its existing app-setting mapping, and
   internal DTOs do not move into root `contracts/`.
4. TKT-263 accounts for all sixteen internal-auth registration modules: thirteen non-outbox modules move
   behind the one registration entrypoint and trust seam, while the three outbox modules are explicitly owned
   by TKT-264.
5. TKT-264 extracts only the common Durable monitor lifecycle across archive mirror, provider Archive, and
   File Request. It preserves their distinct data-plane protocols and first separates or otherwise proves
   preservation of the co-located Box classification monitor. It waits on TKT-246's outbox reliability ADR.
6. TKT-266 adds a route/authority guard keyed by capability, caller lane, auth mode, action class, owner, and
   delegation target. It rejects duplicate authorities inside a lane while allowing an explicit staff BFF to
   delegate to a focused Function.

## Gates

- **PLAN-007** — the shared `@cs/server-runtime` primitives the clients and adapters migrate onto.
- **T8 / TKT-245** — the trust decision gates TKT-263 and TKT-264.
- **TKT-246** — step 4 (outbox generalisation) waits on the outbox-reliability ADR (expected ADR-0030) from
  the platform backfill; this ticket gate is recorded here rather than as a plan ID in `depends-on`, and the
  ADR number is not pre-assigned.

## Close-out

The plan closes only when all members are `done`: one active focused-Function client on the shared primitives,
one internal-trust seam covering every legitimate live caller, all sixteen internal-auth registration modules
accounted for, shared monitor lifecycle code without erased lane protocols, and the route/authority guard
failing a synthetic duplicate authority or second auth helper while accepting an explicit delegation.
`check:runtime-contract` shows routes, shapes, auth, registered Function names, Durable identifiers, and
app-setting names unchanged; dark-lane tests still pass; the aggregate net file/LOC delta is negative; and
full `node verify-all.mjs` is green. No member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**4/6 done (66%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 4 |
| Next | 0 |
| Backlog | 2 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-245](../done/TKT-245-service-trust-seam/TKT-245-service-trust-seam.md) | done | Decide and harden the internal service-trust seam (withServiceAuth) |
| [TKT-262](../done/TKT-262-one-python-function-client/TKT-262-one-python-function-client.md) | done | Consolidate the active focused-Function clients onto one |
| [TKT-263](../done/TKT-263-internal-msi-route-consolidation/TKT-263-internal-msi-route-consolidation.md) | done | Consolidate the internal MSI route surface behind the trust seam |
| [TKT-264](../backlog/TKT-264-outbox-drain-generalisation/TKT-264-outbox-drain-generalisation.md) | backlog | Share the outbox monitor lifecycle without flattening lane protocols |
| [TKT-265](../done/TKT-265-bff-proxy-canonicalisation/TKT-265-bff-proxy-canonicalisation.md) | done | Retire dead orchestration parser and location client exports |
| [TKT-266](../backlog/TKT-266-route-authority-inventory-guard/TKT-266-route-authority-inventory-guard.md) | backlog | Add the route and authority inventory guard |
<!-- /GENERATED:PROGRESS -->
