# Changes — TKT-263: Consolidate the internal MSI route surface behind the trust seam

## Status

Implemented on branch `plan008/canonical-routes`. Pure relocation; behaviour-preserving; no live write.

## What changed

The internal managed-identity route surface is now registered through **one** entrypoint,
`platform/http/register-internal-routes.ts`, for all **thirteen** non-outbox internal modules:
- Added the two previously index-registered non-outbox modules to the aggregator:
  `import '../../features/inbound/retro-routes.js'` and `import '../../features/evidence/backfill-drain-route.js'`
  (both confirmed to use the single `withServiceAuth` seam).
- Removed those two imports from `services/data-api/src/index.ts`; `index.ts` now imports the aggregator once
  (which pulls the 13 non-outbox) plus only the three outbox modules.

The **three outbox modules** (`mirror-outbox-routes`, `provider-outbox-routes`, `file-request-outbox-routes`)
are left registered in `index.ts` and are explicitly **owned by TKT-264** (a comment marks them); PLAN-008
keeps the outbox lifecycle separate from the internal aggregator, so they are not folded here.

Pure relocation: every `app.http()` Function id, route string, method, DTO shape, and `authLevel:'anonymous'`
is untouched.

## Ownership (A1/A4)

Sixteen internal-auth registration modules accounted for: 13 non-outbox (owned here, behind the one
aggregator + the single TKT-245 seam) + 3 outbox (owned by TKT-264). The four `cases/` splits
(internal-resolution / internal-operations / internal-maintenance / internal-archive-holding), the retro
routes, and the evidence-backfill drain are reviewed and retained at their current boundaries — no
file-count-driven inlining (A2 explicitly forbids it).
