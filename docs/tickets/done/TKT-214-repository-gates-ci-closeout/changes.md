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
Linux CI exposed six host/checkout portability defects in four passes: npm had omitted Rollup's,
Rolldown's, Sharp's and Lightning CSS's Linux native packages from the Windows-authored lockfile; the inventory hashed
checkout line endings instead of Git blobs; and reconciliation named a feature-branch commit unavailable
to a shallow checkout. The follow-ups pin the exact Linux packages as optional dependencies, inventory
stage-0 Git blob bytes, and reconstruct the reset baseline from the permanent pre-reset main commit. Sharp's
package record transitively locks its matching libvips binary. Regression
coverage includes a lockfile assertion for every exact root Linux package, a CRLF checkout whose index
contains LF bytes, and a real depth-one clone that must fail
with an actionable full-history instruction. Hygiene CI fetches history for the baseline proof. The four
user-owned `workingspace` files deliberately retain their separate physical-byte locks.
