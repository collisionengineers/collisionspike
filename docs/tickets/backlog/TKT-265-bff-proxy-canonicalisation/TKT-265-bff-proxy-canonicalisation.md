---
id: TKT-265
title: Canonicalise the BFF proxy lane
status: backlog
priority: P3
area: platform
tickets-it-relates-to: [TKT-262, TKT-266]
research-link: docs/tickets/backlog/TKT-265-bff-proxy-canonicalisation/evidence/distillation-note.md
plan: PLAN-008
---

# Canonicalise the BFF proxy lane

## Problem
The BFF proxy re-exposes capabilities that orchestration already reaches directly, giving two paths to the
same capability — a canonical-path violation.

## Evidence
Verified read-only 2026-07-19: `services/data-api/src/platform/http/proxy-routes.ts` (an auxiliary BFF proxy,
explicitly not part of the frozen DataAccess contract) re-exposes `POST /api/parser/parse` and
`POST /api/location-assist/suggest` via data-api's `service-client.ts` — the same parser and location-suggest
capabilities orchestration reaches through its own client. That is a third path duplicating the orchestration
route.

## Proposed change
Settle one canonical path per capability for parser and location-suggest once the SPA-transport migration is
confirmed complete: either the BFF proxy or the direct orchestration path is the canonical one, and the other
is removed or made a thin, documented delegation. Preserve the staff-auth lane and every gated route.

## Acceptance
- **A1.** Parser and location-suggest each have one canonical path; the duplicate BFF re-exposure is removed
  or reduced to a thin documented delegation, with the canonical owner recorded.
- **A2.** The staff-facing auth lane and every gated/dark route are unchanged (`check:runtime-contract` clean;
  gates tests pass).
- **A3.** The change is gated on confirmation that the SPA-transport migration is complete (recorded in
  `changes.md`); no client-visible route breaks.
- **A4.** The net file/LOC delta is non-positive; the web app builds and smoke-loads.
- **A5.** No live write.

## Validation
- `check:runtime-contract`; confirm the SPA still reaches parser/location-suggest through the canonical path;
  gates tests; report the file/LOC delta.

## Research
Distilled from `02-canonical-service-routes.md` step 5; the `proxy-routes.ts` re-exposure of parser +
location-suggest was re-verified read-only on 2026-07-19 (`PLAN-008.dossier`). Sequenced after the single
client (TKT-262).

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
