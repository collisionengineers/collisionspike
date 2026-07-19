---
id: TKT-265
title: Retire dead orchestration parser and location client exports
status: done
priority: P3
area: platform
tickets-it-relates-to: [TKT-262, TKT-266]
research-link: docs/tickets/done/TKT-265-bff-proxy-canonicalisation/evidence/distillation-note.md
plan: PLAN-008
---

# Retire dead orchestration parser and location client exports

## Problem
The plan originally treated orchestration's exported `callParser` and `callLocationSuggest` methods as active
paths that duplicated the staff BFF. Production call-site inspection refutes that premise: both exports are
unused, while the BFF routes are the working authenticated staff entrypoints. Removing or delegating the BFF
would replace a working route with a nonexistent alternative.

## Evidence
Verified read-only 2026-07-19: the SPA's parser transport calls `POST /api/parser/parse`, and its location
assistance flow calls `POST /api/location-assist/suggest`; both are registered in
`services/data-api/src/platform/http/proxy-routes.ts` under staff role checks. Repository-wide production
call-site inspection finds no import or invocation of orchestration's `callParser` or
`callLocationSuggest`. Live orchestration settings contain no `LOCATION_FN_*`, while live data-api settings
contain `LOCATION_SUGGEST_FN_*`.

## Proposed change
Record the BFF as the active staff entrypoint and remove only the unused orchestration `callParser`,
`callLocationSuggest`, `LOCATION` target, and stale `LOCATION_FN_*` documentation. Preserve the BFF, SPA
transports, downstream focused-Function routes, role checks, gates, and live configuration.

## Acceptance
- **A1.** A production call-site inventory proves the orchestration exports are unused and records the BFF as
  the active staff entrypoint/delegation chain for both capabilities.
- **A2.** Only the dead orchestration exports, target constant, and stale setting documentation are removed;
  no `LOCATION_FN_*` fallback or replacement setting is added.
- **A3.** The SPA parser/location transports, BFF routes, staff auth, gates, downstream Function routes, and
  live app-setting names remain unchanged (`check:runtime-contract` and gates tests pass).
- **A4.** Negative import/call-site assertions prevent those dead exports from being reintroduced; both
  TypeScript services and the web app build and smoke-load.
- **A5.** The net file/LOC delta is negative; no live write.

## Validation
- `check:runtime-contract`; exercise both SPA-to-BFF transports; run proxy auth/gate tests and the dead-export
  call-site assertion; report the file/LOC delta; full `node verify-all.mjs`.

## Research
Distilled from `workingspace/architecture-simplification/02-canonical-service-routes.md` step 5, then corrected
against production call sites, SPA transports, and read-only live app-setting names on 2026-07-19. This
dead-client cleanup precedes TKT-262 so unused methods are not migrated into the shared client.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
