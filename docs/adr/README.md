# Architecture decision records

ADRs capture durable decisions and consequences. They do not duplicate live resource state, ticket
progress, branch history, or incident diaries.

| ID | Decision | Status |
| --- | --- | --- |
| [0001](./0001-repairer-first-class-entity.md) | Repairer is a first-class entity | Accepted |
| [0002](./0002-vrm-open-case-correlation.md) | VRM correlation uses compatible open cases | Accepted |
| [0003](./0003-channel-aware-chasers-whatsapp-constraint.md) | Chasers are channel-aware | Accepted |
| [0004](./0004-parser-as-azure-function-inline.md) | Parsing is an inline service boundary | Accepted |
| [0005](./0005-eva-api-full-scope-test-environment.md) | EVA API remains in scope and test-first | Accepted |
| [0006](./0006-vehicle-enrichment-service-boundary.md) | Vehicle enrichment has one service boundary | Accepted |
| [0007](./0007-whatsapp-intake-manual-bulk-ocr-match.md) | WhatsApp intake is manual with assisted matching | Accepted |
| [0008](./0008-tool-boundary-ends-at-eva-handoff.md) | Product boundary ends at EVA handoff and Archive filing | Accepted |
| [0009](./0009-image-processing-suggestion-first.md) | Image processing is staged and suggestion-first | Accepted |
| [0010](./0010-dedup-reference-disambiguated-no-time-window.md) | Deduplication is reference-aware | Accepted |
| [0011](./0011-work-provider-intermediary-garage-roles.md) | Provider and source roles stay distinct | Accepted |
| [0012](./0012-box-centric-intake-additive-hybrid.md) | Box is an additive one-way Archive | Accepted |
| [0013](./0013-loc-export-artifact-no-runtime-address-matching.md) | `Loc` is not an intake address | Accepted |
| [0014](./0014-audit-case-type-second-inspection.md) | Audit is a first-class Case type | Accepted |
| [0015](./0015-email-triage-inbox-management.md) | Every message enters triage | Accepted |
| [0016](./0016-inspection-address-corpus-eva-export.md) | Address suggestions use validated full-address exports | Accepted |
| [0017](./0017-data-retention-erasure-pii-lifecycle.md) | Retention uses expiry plus legal hold | Accepted architecture; policy values open |
| [0018](./0018-cedocumentmapper-dual-target-vendored-engine.md) | Parser core is pinned and vendored | Accepted |
| [0019](./0019-triage-policy-stage-split.md) | Triage separates signals, policy, and suggestions | Accepted |
| [0020](./0020-provider-api-intake-channel.md) | Provider machine-to-machine intake | Accepted |
| [0021](./0021-case-po-marker-taxonomy.md) | Case/PO markers have independent sequences | Accepted |
| [0022](./0022-retroactive-case-reconstruction.md) | Retroactive reconstruction uses a conservative ladder | Accepted |
| [0023](./0023-mcp-server-hosting-and-auth.md) | MCP is hosted with the Data API and read-only first | Proposed |
| [0024](./0024-assistant-write-tier-confirmation-protocol.md) | Assistant writes require human confirmation | Proposed |
| [0025](./0025-shared-capability-registry.md) | AI surfaces share one capability registry | Proposed |

Changing an accepted decision requires a new ADR or an explicit superseding amendment. Exact live state
belongs in [LIVE_FACTS.json](../../LIVE_FACTS.json).
