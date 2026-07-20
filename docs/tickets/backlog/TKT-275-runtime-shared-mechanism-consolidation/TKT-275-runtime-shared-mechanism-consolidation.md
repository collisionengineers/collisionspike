---
id: TKT-275
title: Consolidate residual runtime shared mechanisms (content-hash, request-digest, safeText)
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-270, TKT-249, TKT-258]
research-link: docs/tickets/done/TKT-270-hardcore-repository-drift-audit/evidence/audit-report-2026-07-20.md
---

# Consolidate residual runtime shared mechanisms (content-hash, request-digest, safeText)

## Problem
The TKT-270 audit found three structurally-equivalent runtime mechanisms the series left duplicated, two
carrying a latent correctness split. PLAN-010/TKT-258 consolidated the *scripts* hash core only; these are
runtime residuals.

## Evidence (TKT-270 findings M1–M3)
- **M1** — the evidence content-SHA-256 producer `createHash('sha256').update(bytes).digest('hex')` is repeated
  in 6 runtime sites across both services, and its hex validator `/^[0-9a-f]{64}$/` in 8+ sites with a
  **`/i`-vs-strict alphabet split** (`internal-persist-routes.ts:66`, `merge-evidence.ts:7` accept upper-case;
  the rest are strict lower-case, yet producers only ever emit lower-case).
- **M2** — three private `stableJson` serializers feed persisted idempotency digests that are **not
  byte-compatible** (`Object.keys().sort()`+`undefined` vs `Object.entries().sort(localeCompare)`+`null`), plus
  three order-**sensitive** `JSON.stringify` idempotency sites.
- **M3** — `safeText` (500-char cap, `'<no body>'`) is triplicated verbatim across the 3 orchestration transport
  adapters.

## Proposed change
Add one server-only content-hash producer + a single hex validator (validator beside `@cs/domain`'s existing
`sha256Schema`; producer in `@cs/server-runtime`), one canonical `requestDigest(value)` with a defined
key-ordering + primitive policy (migrating the order-sensitive sites onto it), and move `safeText` to
`@cs/server-runtime` as `safeErrorText`. Behaviour-preserving except deliberately unifying the `/i` and
key-ordering splits (record the chosen alphabet/order). `check:runtime-contract` stays clean.

## Acceptance
- One producer + one validator for the evidence SHA-256; the `/i`-vs-strict split is resolved to one alphabet.
- One `requestDigest` with a single key-order/primitive policy; the divergent copies and order-sensitive sites
  adopt it; existing persisted digests are considered (no silent idempotency-key change without a migration note).
- `safeText` lives once in `@cs/server-runtime`; all three adapters import it.
- Both services build; affected suites pass; `check:runtime-contract` byte-identical; net LOC negative.
- No live write.

## Research
Distilled from the TKT-270 audit report (2026-07-20), findings M1–M3.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
