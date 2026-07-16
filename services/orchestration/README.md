# Orchestration service

This Node 20 Azure Functions application owns asynchronous intake and recovery work. It receives
Microsoft Graph notifications, fetches and preserves messages, coordinates classification and Case
resolution through the REST data service, and runs replay-safe Archive, evidence, mailbox, and
retroactive workflows. It never opens a PostgreSQL connection or owns a second Case model.

## Source map

- `src/workflows/intake/` — intake orchestrator and Case-processing activities.
- `src/workflows/mailbox/` — notifications, subscription maintenance, filing, and sent-message work.
- `src/workflows/evidence/` — evidence persistence, extraction, image routing, and repair work.
- `src/workflows/archive/` — Archive folders, mirrors, maintenance, and File Requests.
- `src/workflows/retro/` — reconstruction from authoritative messages and Archive material.
- `src/adapters/` — typed clients for Graph, the REST data service, AI, and focused Python services.
- `src/platform/` — storage, telemetry, subscription, naming, and replay-support utilities.
- `src/index.ts` — side-effect imports that register every public function.

## Public contract and callers

Function names, HTTP routes, Durable orchestrator/activity names, queue names, and DTOs are deployment
contracts. `src/index.ts` is the complete registration surface. Microsoft Graph calls the notification
and lifecycle routes; the REST data service and staff web app call protected maintenance/action routes;
Durable Functions invokes orchestrators and activities. Authoritative state changes go through the REST
data service.

## Configuration

Configuration is supplied through application settings. The main groups are:

- data service: `DATA_API_URL`, `DATA_API_AUDIENCE`, and managed-identity settings;
- mail: Graph identity settings, `GRAPH_INTAKE_MAILBOXES`, `GRAPH_CLIENT_STATE`, and the public base URL;
- evidence: storage account/container settings;
- focused services: parser, OCR, vehicle, EVA, location, and Archive service URLs/credentials;
- optional capabilities and monitor intervals: the typed gates in `@cs/domain/gates` plus the documented
  interval settings used beside each monitor.

Do not place secret values in source, tests, logs, or documentation.

## Build, test, and package

From the repository root:

```powershell
npm run build:orch
npm run test --workspace @cs/orchestration
npm run bundle:orchestration
```

Unit tests sit beside the modules they cover. Packaging writes an ignored clean bundle to
`.artifacts/deploy/orchestration/` through `scripts/build/build-orchestration.cjs`. Building a bundle
does not authorize deployment; follow `docs/operations/deployment.md` in a separately approved task.
