# Repository scripts

Scripts are grouped by responsibility:

- `build/` creates ignored deployment artifacts under `.artifacts/deploy/`.
- `checks/` contains deterministic CI and pre-commit gates.
- `database/` contains offline database preparation and controlled operational helpers.
- `evaluation/` contains reproducible model and corpus evaluation tooling.
- `hooks/` contains opt-in local Git hooks.
- `maintenance/` generates the tracked and physical-checkout inventories, reset reconciliation,
  evidence catalogues, ticket indexes, and tool adapters.

Run the complete offline gate from the repository root with `npm run verify`.
No script in this directory is a deployment approval or permission to mutate a live system.
