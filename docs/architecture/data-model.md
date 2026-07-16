# Data model

PostgreSQL is the authoritative system of record. The application login is non-owner, row-level security
is enabled and forced, and append-only tables reject update/delete through the application path.

## Core entities

| Entity | Purpose |
| --- | --- |
| `case_` | Assessment work item, identity, lifecycle, provider, vehicle, readiness, and current links |
| `work_provider` | Principal Code, provider rules, own domains, and automation policy |
| `repairer` | Reusable repairer business and figures status |
| `image_source` | Provider, repairer, intermediary, or individual supplying images |
| `inspection_address` | Validated full-address suggestion and source metadata |
| `evidence` | Immutable source identity and case relationship |
| `field_source` | Field-level source lineage and confidence/review state |
| `inbound_email` | Preserved mail identity, classification, triage, and case link |
| `chaser` and `note` | Missing-information activity and staff notes |
| `audit_event` | Append-only record of material actions and decisions |
| `ai_suggestion` | Suggestion-only model output and human disposition |

Provider/repairer, provider/image-source, and provider/address relationships are many-to-many where the
business requires reuse.

## Identity and correlation

Case/PO, provider reference, claim reference, VRM, message identity, and content hash are separate keys.
The correlation order is defined in [case and evidence](../product/case-and-evidence.md) and
[ADR-0010](../adr/0010-dedup-reference-disambiguated-no-time-window.md).

Case types and statuses use stable persisted numeric codes. Human-readable identifiers in source may be
renamed, but the numeric values and their meanings cannot drift. Snapshot tests compare every mapping.

## Source fidelity

Original evidence bytes live in the content-addressed fixture/evidence store or the approved live store.
Database rows retain digest, media type, original name, source channel, and logical ownership. Parsed
fields, OCR text, thumbnails, classifications, and model suggestions are derived artifacts and point back
to their source.

## Archive rule

The Archive receives a one-way copy and may receive user uploads through approved intake. It is not the
relational authority. Automated work may create and add to the live mirror but must not delete Archive
content. Human-governed erasure follows the cross-store procedure.

## Database change discipline

`database/baseline` describes a clean database. `database/migrations` contains ordered changes.
`database/seeds` contains current reference data; production case data is never a seed. Every change must
pass clean-baseline, ordered-migration, permission, and mapping tests before a separately authorized live
application.
