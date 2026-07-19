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
Extract one shared `request()`/`post()` transport core into `@cs/server-runtime` and route all four wrappers
through it, **preserving each wrapper's existing observable error contract**. The core stays error-neutral (or
takes an explicit per-wrapper error mapper): `data-api-http.ts` keeps its typed 409 / `DataApiHttpError` /
evidence-backfill variants, while the bare `provider-archive-api.ts` and `archive-mirror-api.ts` wrappers keep
throwing a plain `Error` on non-2xx — they surface 409 today as a plain `Error`, and
`internalArchiveMirrorOutboxComplete` really can return 409, so the richest copy's typed semantics must not be
forced onto them. Add one bounded-retry primitive: explicit retryable status set (408/429/500/502/503/504),
honour `Retry-After` on 429/503, exponential backoff with jitter, a finite retry count, no double-retry when
wrapping an SDK client that already retries, **and an optional caller-supplied `shouldRetry` predicate** for
non-HTTP callers. Route the inline `chat-client.ts` tool retry through the primitive using a tool-specific
predicate that keeps its current "retry any tool error once" behaviour (it deliberately covers a Postgres
cold-connect timeout inside the pool window, where the thrown error carries no HTTP status). The narrow outbox
tails stay with their adapters (they move in a later plan in this series, reserved as PLAN-008).

## Acceptance
- **A1.** One `request()`/`post()` core lives in `@cs/server-runtime`; the four former wrappers import it and
  each keeps its existing observable error behaviour — `data-api-http.ts`'s typed 409/backfill errors are
  preserved, and the two bare archive wrappers still throw a plain `Error` on non-2xx (including 409), proven
  by tests.
- **A2.** One bounded-retry primitive exists with unit tests covering: `Retry-After` honoured on 429 and 503,
  jittered exponential backoff, the finite cap, the explicit retryable set, non-retry of non-transient 4xx,
  and the caller-supplied `shouldRetry` predicate path.
- **A3.** The `chat-client.ts` inline tool retry is expressed through the primitive with a tool-specific
  predicate that preserves the existing "retry any tool error once" behaviour (a transient DB error is still
  retried), proven by a test; no call path stacks two retry layers.
- **A4.** Routes, request/response shapes and authentication are unchanged (`check:runtime-contract` clean);
  both services build and bundles smoke-load.
- **A5.** The net file/LOC delta for this ticket is negative.
- **A6.** No live deployment or cloud write.

## Validation
- Run the retry-primitive and HTTP-core unit tests plus both service suites; compare route/DTO snapshots;
  report the file/LOC delta; full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (findings B and F). The four-wrapper inventory, the absence
of a shared retry util, the bare wrappers' plain-`Error` 409 contract, the `chat-client.ts` one-shot tool
retry, and the `graph.ts`-has-no-retry correction were re-verified read-only on 2026-07-19; the inventory and
the Microsoft Learn transient-fault guidance (retryable set, `Retry-After`, jitter, no stacked retries) are
recorded in the [distillation note](./evidence/distillation-note.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
