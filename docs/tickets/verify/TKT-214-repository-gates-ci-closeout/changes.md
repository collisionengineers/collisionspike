# Changes — TKT-214: Enforce repository structure in local checks and CI

## Status
verify — the aggregate offline gate and unconditional CI workflow are implemented; the fresh-install
local run passes, and independent close-out remains pending.

## Commits
- Current PLAN-006 implementation following the baseline and mechanical move commits.

## Files touched
- verify-all.mjs
- package.json
- .github/workflows/
- contracts/runtime-contract.snapshot.json
- contracts/runtime-contract.approved-deltas.json
- scripts/checks/
- scripts/maintenance/
- database/tests/

## Summary
The repository now exposes one fail-closed aggregate verification entry point backed by versioned checks
for inventory, evidence, workingspace, structure/output, source size, production dependencies, current-tree
purge, runtime contracts, docs, tickets, database mappings and generated adapters. A deterministic runtime
snapshot covers routes, DTOs, schemas, authentication identifiers, registered resources, PostgreSQL
baseline structure and numeric mappings. Missing check scripts or retained Python suites are failures.
CI remains split into TypeScript, Python and hygiene jobs but invokes the same versioned check scripts.
The first Linux CI execution exposed two host-portability defects: npm had omitted Rollup's Linux binary
from the Windows-authored lockfile, and the inventory hashed checkout line endings instead of Git blobs.
The follow-up pins the Linux package as an optional dependency and inventories stage-0 Git blob bytes,
with regression coverage for a CRLF checkout whose index contains LF bytes. The four user-owned
`workingspace` files deliberately retain their separate physical-byte locks.
