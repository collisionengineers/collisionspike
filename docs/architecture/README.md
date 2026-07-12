# Architecture

How the system is built. **The canonical live registry is [`live-environment.md`](./live-environment.md)** (it mirrors [`LIVE_FACTS.json`](../../LIVE_FACTS.json) — the authoritative source for live IDs/counts).

- [`live-environment.md`](./live-environment.md) — **canonical registry: live IDs / resource names / counts**.
- [`data-model.md`](./data-model.md) — Postgres tables (was Dataverse) + the status state machine.
- [`microsoft-stack.md`](./microsoft-stack.md) — the Microsoft/Azure stack, service per requirement.
- [`eva-field-model.md`](./eva-field-model.md) — the 12-field EVA contract + mappings.
- [`eva-sentry-api.md`](./eva-sentry-api.md) — EVA "Sentry" API v1.2 endpoints & auth.
- [`integrations.md`](./integrations.md) — EVA / enrichment / parser / Box + the feature-gating model.
- [`vehicle-data.md`](./vehicle-data.md) — the canonical DVLA/DVSA contract, immutable MOT evidence and displayed-mileage estimator.
- [`mcp-image-ingestion.md`](./mcp-image-ingestion.md) — constrained registration-based image ingestion for external agents.
- [`inspection-address-corpus.md`](./inspection-address-corpus.md) — the ADR-0013 offline-suggestion model.
- [`data-protection.md`](./data-protection.md) — controller/processor map, lawful-basis, retention.
- [`repository-data-authority.md`](./repository-data-authority.md) — binding authority for full internal project evidence processing and retained security boundaries.
- [`azure-cost-model.md`](./azure-cost-model.md) — the per-service cost model.
- [`repo-constellation.md`](./repo-constellation.md) — the sibling repos (prior-art only).
- [`architecture-audit-2026-06-20.md`](./architecture-audit-2026-06-20.md) — a dated point-in-time audit.
- [`environment.md`](./environment.md) — _historical_ build-environment notes (superseded by `live-environment.md`).
