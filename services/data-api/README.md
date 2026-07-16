# Data API

This Node 20 Azure Functions application is the authoritative REST data service for Case, inbound,
evidence, provider, settings, assistant, vehicle, and Archive-facing data operations. It owns access
to the `collisionspike` PostgreSQL database. Other deployables use its HTTP contract instead of
opening their own database connections.

## Source map

- `src/features/cases/` — Case lifecycle, inspection, dashboard, search, activity, and chaser routes.
- `src/features/inbound/` — inbound queues, persistence, classification, parser-field application,
  and retroactive processing routes.
- `src/features/evidence/` — evidence metadata, upload, retrieval, deduplication, and backfill routes.
- `src/features/archive/` — durable Archive mirror, provider-recovery, and File Request outboxes.
- `src/features/assistant/` — assistant chat, tools, suggestions, image analysis, and usage recording.
- `src/features/providers/` — provider records, keys, recovery, and intake.
- `src/features/settings/` — staff settings and capability gates.
- `src/features/vehicle/` — canonical vehicle lookup, persistence, and retry routes.
- `src/platform/auth/`, `src/platform/db/`, and `src/platform/http/` — authentication, PostgreSQL,
  concurrency, request, response, proxy, and internal-route infrastructure.
- `src/shared/` — cross-feature mapping, validation, identifiers, links, and activity utilities.
- `src/index.ts` — side-effect imports that register every HTTP function.

## Public contract and callers

Function names, HTTP paths, methods, authentication rules, request/response DTOs, database names, and
stable numeric codes are contracts. The staff web app is the main public caller. The orchestration
service and focused Python services call protected internal routes for intake, evidence, enrichment,
and recovery work. `src/index.ts` is the complete route-registration surface.

## Configuration

Configuration is supplied through application settings. The main groups are PostgreSQL connection
settings, staff identity audience and tenant settings, evidence storage, dependent-service URLs and
credentials, and capability gates defined in `@cs/domain/gates`. Managed identity is preferred where
supported. Never place secret values in source, tests, logs, or documentation.

## Build, test, and package

From the repository root:

```powershell
npm run build:api
npm run test --workspace @cs/api
npm run bundle:api
```

Unit and contract tests sit beside the modules they cover. Packaging writes an ignored clean bundle
to `.artifacts/deploy/data-api/` through `scripts/build/build-api.cjs`. Building a bundle does not
authorize deployment; deployment requires a separately approved operation using the documented
runbook.
