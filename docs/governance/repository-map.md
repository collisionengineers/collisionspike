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
[`repository-tree.md`](./repository-tree.md) renders the same `baselineEntries` (current) and `finalEntries` (proposed) as
human-readable per-area directory trees, and asserts at generation time that its per-area subtotals reconcile to the ledger
`summary` and to the inventory `counts` (the proposed file count trails the inventory by the two ledger-omitted governance
artifacts); `check:tree` fails on any drift.
`npm run inventory:checkout` separately enumerates every physical checkout
item, including ignored dependencies, generated output, empty directories, symlinks, and repository
metadata. The checkout inventory is ephemeral and uploaded by CI under `repository-audit-ledgers`; it is
not retained because it contains checkout-local dependency and metadata paths. The staged repository
inventory and reset reconciliation are retained and gated at final HEAD.

## Regenerating governance artifacts

Several committed files are generated, not hand-edited, and CI's `Repository contracts and hygiene` job
fails if any is stale. Editing documentation, tickets, or any tracked file can invalidate them — a stale
inventory or reconciliation ledger is the most common reason a documentation-only change passes locally but
fails in CI. Stage your edits, then regenerate with one command before committing:

```sh
git add -A                    # stage your edits first — the inventory hashes STAGED content
npm run generate:governance   # regenerates ticket views + both ledgers and stages them
```

Each generator and the gate it satisfies:

| Generated artifact | Regenerate | CI gate |
|---|---|---|
| `docs/tickets/BOARD.md`, `docs/tickets/README.md`, plan progress blocks | `npm run generate:tickets` | `check:tickets` |
| `docs/governance/repository-inventory.json` | `npm run generate:inventory` | `check:inventory` |
| `docs/governance/repository-reconciliation.json` | `npm run generate:reconciliation` | `check:reconciliation` |
| `docs/governance/repository-tree.md` | `npm run generate:tree` | `check:tree` |

Order matters, and the inventory reads **staged** blobs — so the artifacts must be staged as they are
produced. Reconciliation reads the inventory (inventory first); the inventory hashes the ticket views (ticket
views before that); and the inventory also records the reconciliation ledger's *own* hash, so the inventory is
regenerated once more after reconciliation to reach a stable fixed point. The repository tree is generated from
reconciliation and is itself an inventory row and a reconciliation `finalEntries` row, so `generate:governance`
folds it into the fixed point: after the first reconciliation it runs `generate:tree`, re-runs inventory and
reconciliation so the tree is counted and its bytes recorded, then settles inventory once more. Because the tree
renders only path structure (never sizes or hashes) the loop converges. `generate:governance` runs the whole
sequence — ticket views → stage → inventory → reconciliation → stage → tree → stage → inventory → reconciliation
→ stage → tree → stage → inventory → reconciliation → stage → inventory → stage — staging only its own generated
paths under `docs/tickets` and `docs/governance` (never `-A`). Run it whole rather than the individual
generators, which would otherwise leave the inventory recording a stale reconciliation hash. The
generated agent adapters and the runtime contract regenerate separately
(`node scripts/maintenance/generate-agent-adapters.mjs`, `npm run generate:runtime-contract`).

Enable the repository pre-commit hook once per clone so this staleness is caught before it reaches CI:

```sh
git config core.hooksPath scripts/hooks
```

The hook (`scripts/hooks/pre-commit`) blocks a commit whose inventory or reconciliation ledger is stale and
prints the one-shot fix above. Bypass a single work-in-progress commit with `git commit --no-verify`.
