# Repository map

## Runtime and contracts

| Path | Owner and purpose |
| --- | --- |
| `apps/web` | Staff experience and authenticated REST client |
| `services/data-api` | REST routes, authorization, database access, and synchronous capabilities |
| `services/orchestration` | Mail intake, durable workflows, and asynchronous coordination |
| `services/functions/*` | Bounded Python processing or integration services |
| `packages/domain` | Environment-free domain contracts, schemas, and pure rules |
| `contracts` | External wire contracts and shared schema artifacts |
| `database` | Baseline, ordered changes, seeds, tests, and operational SQL |
| `infrastructure` | Azure resource definitions and deployment configuration |

## Verification and knowledge

| Path | Purpose |
| --- | --- |
| `tests/fixtures/evidence/sha256` | Unique immutable source blobs |
| `tests/fixtures/manifests` | Logical evidence uses and fixture metadata |
| `tests/evaluation` | Evaluation definitions and runners |
| `docs` | Current product and engineering knowledge |
| `docs/reviews` | Binding user reviews |
| `docs/tickets` | Work authority and plans |
| `scripts` | Build, checks, database, evaluation, hooks, and maintenance tasks |
| `tools` | Small repository utilities |
| `workingspace` | User-owned brainstorming files; content is immutable to agents by default |

## Sibling repositories

This repository is the build target. Sibling repositories may contain useful prior art or an authoring
source, but they are not runtime dependencies and do not override this repository's reviews, ADRs, or
current docs. The parser engine is the one deliberate vendoring relationship: update its authoring
repository first, then refresh the pinned copy here.

## Generated adapters and output

`.agents` is canonical for roles and skills. Other tool directories are generated views and must pass
generation-parity checks. Build and deployment output goes under ignored `.artifacts/`; dependency trees,
caches, logs, and generated evaluations are never tracked.

## Inventory and reset reconciliation

[`repository-inventory.json`](./repository-inventory.json) is the deterministic manifest of every
tracked file and ancestor directory. `npm run check:reconciliation` maps every immutable pre-reset
tracked row to its final keep, move, rewrite, or deletion disposition and proves every final row has an
origin and ticket owner. `npm run inventory:checkout` separately enumerates every physical checkout
item, including ignored dependencies, generated output, empty directories, symlinks, and repository
metadata. The two large path-level ledgers are ephemeral locally and uploaded by CI under
`repository-audit-ledgers`; they are not retained at final HEAD because the reconciliation necessarily
contains removed path names and checkout-local dependency material.
