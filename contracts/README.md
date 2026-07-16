# External contracts

This directory contains versioned wire schemas shared with systems outside the repository. Treat route
names, required fields, and response shapes as public interfaces. A change requires an owning ticket,
contract tests, and explicit caller reconciliation.

Internal TypeScript DTOs and generated JSON schemas live in [`packages/domain`](../packages/domain/README.md).

The runtime contract snapshot records the current HTTP routes, exported domain DTOs, JSON schemas,
authentication policy identifiers, registered resource names, PostgreSQL baseline, and stable numeric
codes. Run `npm run check:runtime-contract` after changing any of those surfaces. Intentional
departures from the PLAN-006 baseline require an owning ticket entry in
`runtime-contract.approved-deltas.json`. After recording that approval, run
`npm run generate:runtime-contract` to regenerate `runtime-contract.snapshot.json`.
