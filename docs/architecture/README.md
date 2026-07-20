# Architecture

CollisionSpike is a cohesive monorepo with one staff web app, two TypeScript service applications,
focused Python services, a browser-safe shared domain package (`@cs/domain`), a server-only shared
runtime package (`@cs/server-runtime`, [ADR-0031](../adr/0031-server-runtime-boundary.md)), and
PostgreSQL as the system of record.

## Read by concern

- [System overview](./system-overview.md)
- [Data model](./data-model.md)
- [Integrations](./integrations.md)
- [EVA field model](./eva-field-model.md)
- [EVA Sentry API](./eva-sentry-api.md)
- [Inspection-address corpus](./inspection-address-corpus.md)
- [Vehicle data](./vehicle-data.md)
- [Data protection](./data-protection.md)
- [MCP image ingestion](./mcp-image-ingestion.md)
- [Guided capture](./guided-capture.md)

Exact live resources and flags are not architecture. Read
[LIVE_FACTS.json](../../LIVE_FACTS.json) and the [live environment summary](../operations/live-environment.md)
when current state matters.
