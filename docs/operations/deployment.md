# Deployment

Repository cleanup and documentation work never imply deployment authority. Use this sequence only in a
separately authorized deployment task.

## Preconditions

1. Start from a clean clone at the reviewed commit.
2. Run `npm ci` from the root.
3. Run the complete build, TypeScript tests, retained Python tests, database tests, contract snapshots,
   evidence checks, and documentation/ticket checks.
4. Confirm public REST routes, DTOs, numeric mappings, and database expectations against the approved
   baseline.
5. Validate Azure configuration without printing secret values.
6. Record intended resources, rollback point, and post-deployment probes in the owning ticket.

## Artifact rule

Build self-contained Linux Azure Functions artifacts with `npm run package:deploy`. That command writes to
ignored `.artifacts/deploy/`, installs production dependencies inside each artifact, and targets the Data
API's Sharp/libvips packages to Azure's Linux x64/glibc runtime even when packaging on Windows. A plain
`npm run bundle` writes source bundles and lockfiles only; it is not a deployable package. Confirm the Data
API artifact contains `@azure/functions`, `@img/sharp-linux-x64`, and
`@img/sharp-libvips-linux-x64`, and the orchestration artifact contains `@azure/functions` and
`durable-functions`, before `func azure functionapp publish`. Packaging must succeed from a clean clone.
Never deploy a tracked ZIP or a local bundle whose source commit is unclear.

## Order

Deploy a database change only when the new application works safely with both schema states and the change has
an approved live-write step. Then deploy focused Python services, Data API, orchestration, and the web app
in the ticket's tested order. A component not changed by the reviewed commit is not redeployed merely for
convenience.

## Post-deployment proof

- Confirm resource health, version/commit marker, HTTPS, and expected function registrations.
- Run authenticated positive and negative probes for changed routes.
- Inspect the component's own monitoring resource for new failures.
- Confirm mail, queue, database, and Archive effects only where the task authorizes those effects.
- Update `LIVE_FACTS.json` from dated evidence and attach the evidence to the ticket.

If a probe fails, stop and use [diagnostics](./diagnostics.md). Do not repeat a failing publish or live
command without establishing a cause.
