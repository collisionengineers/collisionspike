---
id: TKT-262
title: Consolidate the active focused-Function clients onto one
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-248, TKT-249, TKT-265]
research-link: docs/tickets/backlog/TKT-262-one-python-function-client/evidence/distillation-note.md
plan: PLAN-008
---

# Consolidate the active focused-Function clients onto one

## Problem
The focused Python Functions are reached through two independently hand-rolled TypeScript clients — one in
orchestration and one in data-api. Their transport helpers and active Box/OCR facades overlap, but their method
sets and error contracts also differ. Two orchestration methods previously cited as duplicate routes
(`callParser` and `callLocationSuggest`) have no production caller and are owned as dead-client cleanup by
TKT-265; carrying them into a shared client would preserve invented duplication.

## Evidence
Verified read-only 2026-07-19: `services/orchestration/src/adapters/functions-client.ts` uses
`callFunction` for active parser classification/extraction, OCR, EVA, and Box calls;
`services/data-api/src/platform/http/service-client.ts` uses `callFn` for active vehicle, parser, location,
OCR, and Box calls. They overlap actively at the transport, Box facade, and plate-OCR layers, with intentionally
different retry/timeout/error contracts. The Box SDK/token mint itself remains single-site in the
`box-webhook` Python Function. Live settings also differ by service: data-api owns `BOX_FN_*` and
`LOCATION_SUGGEST_FN_*`, while orchestration owns `BOXWEBHOOK_FN_*` and has no live `LOCATION_FN_*` setting.

## Proposed change
After TKT-265 removes the unused exports, add one owned focused-Function client module/subpath to the
server-only `@cs/server-runtime` package and migrate the remaining active methods onto PLAN-007's HTTP/retry
primitives. Each service injects its existing target configuration, retaining its current app-setting names;
there is no dual-read fallback and no live configuration migration. Client-only TypeScript DTOs stay with the
shared client, while genuinely browser-safe domain contracts use `@cs/domain`. Root `contracts/` remains
reserved for external wire schemas.

## Acceptance
- **A1.** One active focused-Function client exists as an owned `@cs/server-runtime` module/subpath; the two
  former transport/facade implementations are removed and both services import the shared client.
- **A2.** TKT-265's unused orchestration parser/location methods are not migrated. A production call-site
  inventory maps every retained method to its caller, route, target, and observable error contract.
- **A3.** Each service injects its existing target configuration. `BOX_FN_*`, `LOCATION_SUGGEST_FN_*`, and
  `BOXWEBHOOK_FN_*` remain at their current service boundaries and in config capture; no `LOCATION_FN_*`
  compatibility fallback is introduced.
- **A4.** Client-only DTOs are co-located with the shared server client; only genuinely browser-safe domain
  contracts use `@cs/domain`. No internal TypeScript DTO is added to root `contracts/`.
- **A5.** Contract tests cover every retained method family and both services' timeout/retry/error differences;
  `check:runtime-contract` is clean, both services build, and both bundles smoke-load.
- **A6.** The net file/LOC delta is negative; no live write.

## Validation
- `check:runtime-contract`; exercise each retained method family through its owning service and drive one active
  call from each service end-to-end; compare payload/error semantics before and after; report the file/LOC
  delta; full `node verify-all.mjs`.

## Research
Distilled from `workingspace/architecture-simplification/02-canonical-service-routes.md` step 2 (findings C
and D), then corrected against the call sites, `contracts/README.md`, live app-setting names, and PLAN-007 on
2026-07-19. Builds on PLAN-007 and follows TKT-265's dead-client proof.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
