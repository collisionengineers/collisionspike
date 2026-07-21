# Operations

These pages describe the current Azure/PostgreSQL system. They do not grant authority to mutate it.
Every live write requires explicit task scope, the relevant checks, and a recorded outcome.

- [Live environment](./live-environment.md)
- [Cloud inventory (2026-07-17)](./cloud-inventory-2026-07-17.md) — full read-only tenant/subscription inventory
- [Helper-app consolidation assessment](./helper-app-consolidation-assessment.md) — read-only TKT-256 assessment (keep per-service plan/storage isolation)
- [Operator actions](./operator-actions.md)
- [Deployment](./deployment.md)
- [Diagnostics](./diagnostics.md)
- [Identity and access](./identity-and-access.md)
- [Database operations](./database.md)
- [Secrets](./secrets.md)
- [Archive operations](./archive.md)
- [Vehicle-data rollout](./vehicle-data-rollout.md)
- [Data-subject rights](./data-subject-rights.md)
- [Delete one case image](./delete-case-image.md)
- [Feature gates](./feature-gates.md) — every flag defined in plain language, with live state and implications
- [Alpha testing](./alpha-testing.md) — the PLAN-015 QDOS single-provider cutover runbook and local shadow bring-up

Exact dated values belong in [LIVE_FACTS.json](../../LIVE_FACTS.json). Open work remains authoritative
in [tickets](../tickets/README.md); the operator-actions page is a generated view of that authority.
