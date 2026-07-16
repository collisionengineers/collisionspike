# System overview

## Components

| Component | Source | Responsibility |
| --- | --- | --- |
| Staff web app | `apps/web` | Authentication, case handling, review, evidence, and explicit staff actions |
| Data API | `services/data-api` | REST contracts, role checks, database transactions, synchronous capabilities, and audit writes |
| Orchestration | `services/orchestration` | Mail notifications, durable intake, classification, asynchronous work, and retries |
| Domain package | `packages/domain` | Environment-free contracts, schemas, code tables, and pure business rules |
| Python services | `services/functions/*` | Parsing, OCR, vehicle facts, EVA operations, Archive events, and location assistance |
| PostgreSQL | `database` | Authoritative relational state, source lineage, audit, and append-only evidence metadata |
| Azure resources | `infrastructure` | Hosting, identity, storage, secrets, monitoring, mapping, document extraction, and AI services |

## Main data flow

```text
Microsoft Graph notification
  -> orchestration fetches and preserves the message
  -> classify, correlate, parse and enrich
  -> Data API commits a transaction and audit events
  -> staff web app reviews the Case
  -> readiness gate
  -> EVA handoff and one-way Archive copy
```

Manual intake uses the same Data API contracts and persistence rules. Long-running work uses stable
operation identities so retries replay the first committed result rather than duplicating effects.

## Boundaries

- The web app never talks directly to PostgreSQL or provider services.
- Orchestration calls the Data API for authoritative writes; it does not own an alternative case model.
- Python services return versioned contracts and do not mutate case state directly unless their explicit
  service contract says so.
- PostgreSQL role and row-level policies are the final data boundary. UI hiding is not authorization.
- The Archive is a one-way operational copy. Case logic and relational joins never depend on Archive
  metadata.
- External HTTP routes, DTOs, Azure resource names, database columns, and persisted numeric codes are
  compatibility contracts.

## Reliability posture

Inbound messages and external effects are idempotent. Exact duplicates are dropped; ambiguous case
matches remain visible for staff. Durable activities may retry, so every effecting call needs a stable
operation key and a recorded outcome. External outages degrade the relevant capability without making
the core Case disappear.
