---
id: TKT-263
title: Consolidate the internal MSI route surface behind the trust seam
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-245, TKT-262, TKT-266]
research-link: docs/tickets/done/TKT-263-internal-msi-route-consolidation/evidence/distillation-note.md
plan: PLAN-008
---

# Consolidate the internal MSI route surface behind the trust seam

## Problem
The internal managed-identity route surface is registered through sixteen modules, but only eleven are imported
by `register-internal-routes.ts`. Two non-outbox modules and three outbox modules are registered separately in
`index.ts`, so consolidating only the eleven-module aggregator would leave the claimed surface incomplete.

## Evidence
Verified read-only 2026-07-19: `services/data-api/src/platform/http/register-internal-routes.ts` wires eleven
internal registration modules, including four under `cases/`. `services/data-api/src/index.ts` separately
registers `features/inbound/retro-routes.ts` and `features/evidence/backfill-drain-route.ts`, both of which
expose `/api/internal/*` handlers through the same shared seam. It also separately registers the three outbox
route modules owned by TKT-264. That is thirteen non-outbox modules and sixteen total internal-auth modules.

## Proposed change
Once TKT-245 has decided the single trust seam, build a complete registration inventory and move all thirteen
non-outbox modules behind one internal registration entrypoint. Review thin single-caller modules for
consolidation, but do not equate a single entrypoint with mandatory file inlining. Explicitly assign the three
outbox modules to TKT-264 and preserve every route path, payload, and gated lane.

## Acceptance
- **A1.** An AST/runtime-snapshot inventory accounts for all sixteen internal-auth registration modules:
  thirteen non-outbox modules owned here and three outbox modules explicitly owned by TKT-264.
- **A2.** All thirteen non-outbox modules register through one internal entrypoint and the single TKT-245 seam;
  any file-level inlining is justified by caller/ownership evidence rather than a file-count target.
- **A3.** Every internal route path, request/response shape, and authentication behaviour is unchanged
  (`check:runtime-contract` clean); no gated/dark lane is removed (the gates tests still pass).
- **A4.** The four `cases/` splits, retro routes, and backfill drain are reviewed with ownership recorded.
- **A5.** The net file/LOC delta is negative; both services build.
- **A6.** No live write.

## Validation
- `check:runtime-contract`; the dark-lane gates tests in `verify-all.mjs`; drive one internal route end-to-end;
  report the file/LOC delta.

## Research
Distilled from `workingspace/architecture-simplification/02-canonical-service-routes.md` step 3, then corrected
against `services/data-api/src/index.ts`, the shared-auth imports, and the runtime route snapshot on
2026-07-19. Depends on TKT-245 (the decided seam).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
