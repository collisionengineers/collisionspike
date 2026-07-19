---
id: TKT-268
title: Implement the Python token/backoff conformance suite
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-267, TKT-269]
research-link: docs/tickets/backlog/TKT-268-python-token-backoff-conformance-suite/evidence/distillation-note.md
plan: PLAN-011
---

# Implement the Python token/backoff conformance suite

## Problem
The divergent per-service token/backoff reimplementations drift silently: a fix to one service's cache-expiry
or retry logic is not reflected in the others, and there is no check that each service's client actually
honours the behaviours it should. Whichever way TKT-267 decides, the duplication must stop being a silent
drift risk.

## Evidence
Verified read-only 2026-07-19: at least four backoff variants and three token-cache shapes across the six
services, with two services lacking a bounded 429/5xx backoff and two lacking a token cache entirely
(`PLAN-011.dossier`). No shared behavioural contract pins these today.

## Proposed change
On TKT-267's affirm path, add a shared **behavioural conformance suite** each service's token/backoff code is
exercised against: a client that mints a bearer token caches it and refreshes near expiry; a client that
claims bounded retry honours 429/5xx with backoff and `Retry-After` where applicable; a client that
deliberately does neither (e.g. `location-assist/ai_reasoning.py`) declares that explicitly so the suite does
not demand behaviour it never promised. On the reverse path, replace the duplication with a minimal shared
Python module mirroring the `@cs/server-runtime` shape. Pin observable behaviour, never internals.

## Acceptance
- **A1.** A shared behavioural conformance suite exists under the Python test tree, parameterised per service,
  asserting the token-cache-expiry and bounded-backoff behaviours each client claims.
- **A2.** Each of the six services is either covered by the suite or explicitly declares (and the suite
  records) that it does not implement a given behaviour — no silent gaps; the `ai_reasoning.py` no-cache,
  no-backoff variant is captured explicitly.
- **A3.** A synthetic divergence (a token cache that ignores expiry, or a backoff that retries a non-transient
  4xx) is caught by the suite.
- **A4.** The suite runs under `verify-all.mjs`; existing per-service pytest suites still pass.
- **A5.** No live write; behaviour is unchanged (the suite pins existing behaviour, it does not alter it).

## Validation
- Run the conformance suite (expect pass on current behaviour) and a synthetic-divergence fixture (expect
  fail); full `node verify-all.mjs` including the Python suites.

## Research
Distilled from `05-python-doctrine-and-parity.md` ticket 2, reframed after read-only verification on
2026-07-19 (`PLAN-011.dossier`) from "copies-in-sync" to a **behavioural** conformance suite, because the
reimplementations are non-uniform. Follows TKT-267's decision.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
