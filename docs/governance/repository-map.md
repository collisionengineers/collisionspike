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
stage-0 index file and ancestor directory. Tracked sizes and hashes come from staged Git blobs so the
manifest is independent of checkout filters and host line endings. Untracked rows, when explicitly
requested, use physical checkout bytes. The four immutable `workingspace` files are the deliberate
exception: their separately locked physical sizes and hashes preserve the user-owned byte contract.
[`repository-reconciliation.json`](./repository-reconciliation.json) maps every immutable pre-reset
tracked row to its final keep, move, rewrite, or deletion disposition and proves every final row has an
origin and ticket owner. Keep and move rows are byte-checked against their staged destinations, rewrites
must actually differ, and every deletion carries an explicit PLAN-006 retirement reason. The checker
reconstructs the baseline from the locked pre-reset main commit's Git tree and requires the committed
ledger to match exactly, so the proof survives merge strategy and cannot be replaced by a locally generated
summary. A historical string that matches the retired-vocabulary policy is represented in the committed
ledger by an irreversible SHA-256 reference; validation still uses the exact Git-tree value before that
policy-safe serialization. The inventory and reconciliation files are omitted from the reconciliation content map to avoid a
mutual hash cycle; the independent layout and inventory gates still require and record both artifacts.
`npm run inventory:checkout` separately enumerates every physical checkout
item, including ignored dependencies, generated output, empty directories, symlinks, and repository
metadata. The checkout inventory is ephemeral and uploaded by CI under `repository-audit-ledgers`; it is
not retained because it contains checkout-local dependency and metadata paths. The staged repository
inventory and reset reconciliation are retained and gated at final HEAD.
