# Infrastructure configuration capture

These Bicep templates make the current application configuration reviewable without treating source
files as proof of live state. They reference existing resources and declare the configuration owned by
this repository:

| File | Ownership |
| --- | --- |
| `api.bicep` | Data API settings, managed identity, secret references, storage access, and feature gates |
| `orch.bicep` | Orchestration settings, mail intake dependencies, managed identity, storage access, and feature gates |
| `spa.bicep` | Staff web application resource identity and SKU |

Service-specific host templates are centralised under `infrastructure/functions/<service>/` (one
convention across the estate, per TKT-255 / [ADR-0028](../../docs/adr/0028-three-tier-compute-topology.md)).
Secret values never belong in source; templates accept secure values or secret references only.

`az bicep build` is the offline syntax gate. A build or pull request does not authorize a live
deployment. Before any approved deployment, compare the template with read-only resource state and use
the procedure in [Deployment](../../docs/operations/deployment.md). Exact dated resource state belongs
only in [LIVE_FACTS.json](../../LIVE_FACTS.json) and its concise
[environment view](../../docs/operations/live-environment.md).
