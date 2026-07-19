---
id: TKT-249
title: Consolidate the Data-API HTTP core and add one bounded-retry primitive
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-210, TKT-247, TKT-248, TKT-251]
research-link: docs/tickets/backlog/TKT-249-data-api-http-wrapper-and-retry-primitive/evidence/distillation-note.md
plan: PLAN-007
---

# Consolidate the Data-API HTTP core and add one bounded-retry primitive

## Problem
The Data-API HTTP request wrapper is re-implemented four times, each independently reading `DATA_API_URL`,
building the `Authorization: Bearer` header and re-inventing error text; the richest copy alone maps 409s to
typed conflict errors. Separately, there is no shared bounded-retry primitive — retry logic is hand-rolled in
several unrelated styles, and none consistently honours a server `Retry-After` or adds jitter.

## Evidence
Four request wrappers verified read-only on 2026-07-19: `data-api-http.ts` `request()` (richest — typed 409
conflicts, 204 handling), `provider-archive-api.ts` `request()` (bare), `archive-mirror-api.ts` `request()`
(byte-identical to the previous), `box-maintenance-api.ts` `post()` (POST-only, own `AbortController`
timeout). No shared core. No first-party retry util exists; retry today is Durable-Functions `RetryOptions`
with divergent tunings, several bespoke `isRetryable*` predicates, and an inline one-shot retry in
`chat-client.ts`. `graph.ts` has no retry loop (its loops are pagination). Exact locations in the research
link.

## Proposed change
Extract one shared `request()`/`post()` core into `@cs/server-runtime` (preserving the richest copy's typed
409/204 semantics as the superset behaviour) and route all four wrappers through it. Add one bounded-retry
primitive: explicit retryable status set (408/429/500/502/503/504), honour `Retry-After` on 429/503,
exponential backoff with jitter, a finite retry count, and no double-retry when wrapping an SDK client that
already retries. Route the inline `chat-client.ts` retry through it. The narrow outbox tails stay with their
adapters (they move in PLAN-008).

## Acceptance
- **A1.** One `request()`/`post()` core lives in `@cs/server-runtime`; the four former wrappers import it and
  keep their existing observable error behaviour (typed 409 conflict errors preserved), proven by tests.
- **A2.** One bounded-retry primitive exists with unit tests covering: `Retry-After` honoured on 429 and 503,
  jittered exponential backoff, the finite cap, the explicit retryable set, and non-retry of non-transient
  4xx.
- **A3.** The `chat-client.ts` inline retry is replaced by the primitive; no call path stacks two retry layers.
- **A4.** Routes, request/response shapes and authentication are unchanged (`check:runtime-contract` clean);
  both services build and bundles smoke-load.
- **A5.** The net file/LOC delta for this ticket is negative.
- **A6.** No live deployment or cloud write.

## Validation
- Run the retry-primitive and HTTP-core unit tests plus both service suites; compare route/DTO snapshots;
  report the file/LOC delta; full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (findings B and F). The four-wrapper inventory, the absence
of a shared retry util, and the `graph.ts`-has-no-retry correction were re-verified read-only on 2026-07-19
(`PLAN-007.dossier`); Microsoft Learn transient-fault guidance (retryable set, `Retry-After`, jitter, no
stacked retries) is cited there.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
