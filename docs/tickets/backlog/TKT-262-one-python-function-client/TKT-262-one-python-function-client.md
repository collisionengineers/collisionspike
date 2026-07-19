---
id: TKT-262
title: Collapse the two Python-function clients onto one
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-245, TKT-248, TKT-249, TKT-263]
research-link: docs/tickets/backlog/TKT-262-one-python-function-client/evidence/distillation-note.md
plan: PLAN-008
---

# Collapse the two Python-function clients onto one

## Problem
The Python-function services are reached through two independently hand-rolled TypeScript clients — one in
orchestration, one in data-api — that duplicate request/response logic, transport helpers, environment-variable
names, and error semantics. The same capabilities (parser, OCR, location-suggest, Box) are implemented twice,
so a fix to one is silently missing from the other.

## Evidence
Verified read-only 2026-07-19: `services/orchestration/src/adapters/functions-client.ts` (transport
`callFunction`) and `services/data-api/src/platform/http/service-client.ts` (transport `callFn`) each
re-implement `callParser`, `callLocationSuggest`, `callPlateOcr` and a full Box facade, with divergent env-var
names (e.g. `LOCATION_FN_URL` vs `LOCATION_SUGGEST_FN_URL`) and divergent error handling (throw-for-retry vs
typed-error/timeout). The Box SDK/token mint itself is single-site (in the `box-webhook` Python function) — the
duplication is the two TypeScript facades (finding D) riding on the two-client split (finding C).

## Proposed change
Collapse the two clients onto PLAN-007's `@cs/server-runtime` HTTP + retry primitives, producing one
Python-function client, and move the shared request/response types into `contracts/` (a PLAN-006 locked
structure element). The Box facade duplication falls out with the single client. Preserve each caller's
observable behaviour; reconcile the divergent env-var names deliberately.

## Acceptance
- **A1.** One Python-function client exists (built on `@cs/server-runtime`'s request/retry primitives); the two
  former clients are removed and both services import the single client.
- **A2.** The shared request/response types live in `contracts/`; the Box facade is defined once.
- **A3.** Divergent env-var names are reconciled to one set, recorded in `changes.md`; no capability changes
  its route or payload (`check:runtime-contract` clean).
- **A4.** One representative internal call is driven end-to-end and behaves identically before and after; both
  services build and their bundles smoke-load.
- **A5.** The net file/LOC delta is negative; no live write.

## Validation
- `check:runtime-contract`; drive one internal call end-to-end (the verify skill); compare payloads before/after;
  report the file/LOC delta; full `node verify-all.mjs`.

## Research
Distilled from `02-canonical-service-routes.md` step 2 (findings C and D); the two-client duplication, the
single-site Box token mint, and the divergent env-var names were re-verified read-only on 2026-07-19
(`PLAN-008.dossier`). Builds on PLAN-007; follows TKT-245 (T8).

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
