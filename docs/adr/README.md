# Architecture decision records

ADRs capture durable decisions and consequences. They do not duplicate live resource state, ticket
progress, branch history, or incident diaries.

| ID | Decision | Status |
| --- | --- | --- |
| [0001](./0001-repairer-first-class-entity.md) | Repairer is a first-class entity | Accepted |
| [0002](./0002-vrm-open-case-correlation.md) | VRM correlation uses compatible open cases; registration is the temporary image-first identity | Accepted |
| [0003](./0003-channel-aware-chasers-whatsapp-constraint.md) | Chasers are channel-aware | Accepted |
| [0004](./0004-parser-as-azure-function-inline.md) | Parsing is an inline service boundary | Accepted |
| [0005](./0005-eva-api-full-scope-test-environment.md) | EVA API remains in scope and test-first | Accepted |
| [0006](./0006-vehicle-enrichment-service-boundary.md) | Vehicle enrichment has one service boundary | Amended 2026-07-16 |
| [0007](./0007-receipt-of-images.md) | Images are received through five recorded channels | Accepted |
| [0008](./0008-tool-boundary-ends-at-eva-handoff.md) | Product responsibility runs to confirmed report delivery | Accepted |
| [0009](./0009-image-processing-suggestion-first.md) | Image processing is staged and suggestion-first | Amended 2026-07-16 |
| [0010](./0010-dedup-reference-disambiguated-no-time-window.md) | Deduplication is reference-aware | Accepted |
| [0011](./0011-work-provider-intermediary-garage-roles.md) | Provider, intermediary, Repairer, and Image Source are distinct roles one party may combine | Accepted |
| [0012](./0012-box-centric-intake-additive-hybrid.md) | Box is an additive one-way Archive; automated deletion is prohibited | Accepted |
| [0013](./0013-loc-export-artifact-no-runtime-address-matching.md) | The inspection address is a staff decision from the full-address corpus; `Loc` is retired | Accepted |
| [0014](./0014-audit-case-type-second-inspection.md) | Audit is a first-class Case type with two shapes and a derived QDOS identifier | Accepted |
| [0015](./0015-email-triage-inbox-management.md) | Every message enters deterministic triage; the vocabulary lives in code and corpus, append-only | Accepted |
| [0016](./0016-inspection-address-corpus-eva-export.md) | Address suggestions use validated full-address exports | Amended 2026-07-16 |
| 0017 | Withdrawn 2026-07-16 (Review 160726) — retention architecture removed with TKT-206; the Archive no-automated-deletion rule lives in ADR-0012 | Withdrawn |
| [0018](./0018-cedocumentmapper-dual-target-vendored-engine.md) | Parser core is pinned and vendored | Accepted |
| [0019](./0019-triage-policy-stage-split.md) | Triage separates signals, policy, and suggestions | Accepted |
| [0020](./0020-provider-api-intake-channel.md) | Provider machine-to-machine intake | Accepted |
| [0021](./0021-case-po-marker-taxonomy.md) | Case/PO markers have independent sequences | Accepted |
| [0022](./0022-retroactive-case-reconstruction.md) | Retroactive reconstruction uses a conservative ladder | Amended 2026-07-16 |
| [0023](./0023-mcp-server-hosting-and-auth.md) | MCP is hosted with the Data API under a tiered access model | Accepted |
| [0024](./0024-assistant-write-tier-confirmation-protocol.md) | Assistant writes require human confirmation | Accepted |
| [0025](./0025-shared-capability-registry.md) | AI surfaces share one capability registry | Accepted |

Changing an accepted decision requires a new ADR or an explicit superseding amendment. Exact live state
belongs in [LIVE_FACTS.json](../../LIVE_FACTS.json).

## Conventions

- **Status vocabulary:** `Proposed` / `Accepted` / `Amended (dated)` / `Superseded by ADR-NNNN` /
  `Withdrawn`. Build state lives in the body with plain TKT references, never in the Status line.
- **Amendments** use dated headings of the form `## Amendment — <topic> (YYYY-MM-DD)`.
- **Relationship clauses** ("refined by", "extends", "supersedes", review provenance) sit in the
  Status line.
- An ADR links the current documents that realize it; those documents carry a one-line
  "Decision of record: ADR-NNNN" back-link.
