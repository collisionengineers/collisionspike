---
id: TKT-263
title: Consolidate the internal MSI route surface behind the trust seam
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-245, TKT-262, TKT-266]
research-link: docs/tickets/backlog/TKT-263-internal-msi-route-consolidation/evidence/distillation-note.md
plan: PLAN-008
---

# Consolidate the internal MSI route surface behind the trust seam

## Problem
The internal managed-identity route surface is fanned into eleven registration modules — four of them under
`cases/` alone — each inheriting the internal-trust seam silently. The granularity is finer than the callers
justify, and it all sits behind the trust model that TKT-245 must decide first.

## Evidence
Verified read-only 2026-07-19: `services/data-api/src/platform/http/register-internal-routes.ts` wires eleven
internal registration modules, including four under `cases/` (`internal-resolution`, `internal-operations`,
`internal-maintenance`, `internal-archive-holding`). All are guarded by the internal-trust seam TKT-245
consolidates.

## Proposed change
Once TKT-245 has decided and hardened the single trust seam, review the eleven modules for single-caller
granularity and consolidate them behind the one decided wrapper — inlining thin single-caller registrations
rather than re-wrapping them. Preserve every route path, payload, and gated lane exactly.

## Acceptance
- **A1.** The internal registration modules are consolidated behind the single TKT-245 trust seam; thin
  single-caller registrations are inlined, not re-wrapped in a new layer.
- **A2.** Every internal route path, request/response shape, and authentication behaviour is unchanged
  (`check:runtime-contract` clean); no gated/dark lane is removed (the gates tests still pass).
- **A3.** The four `cases/` splits are reviewed and consolidated where single-caller, with ownership recorded.
- **A4.** The net file/LOC delta is negative; both services build.
- **A5.** No live write.

## Validation
- `check:runtime-contract`; the dark-lane gates tests in `verify-all.mjs`; drive one internal route end-to-end;
  report the file/LOC delta.

## Research
Distilled from `02-canonical-service-routes.md` step 3; the eleven-module count and the four `cases/` splits
were re-verified read-only on 2026-07-19 (`PLAN-008.dossier`). Depends on TKT-245 (the decided seam).

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
