# ADR-0012 — Box is an additive, one-way Archive and intake surface

**Status:** Accepted (2026-06-21), current architecture confirmed 2026-06-27.

## Decision

Use Box as the human-navigable Archive, a per-Case/PO folder from early case handling, and an account-free
image intake surface through File Requests. PostgreSQL remains the relational system of record.

The Data API and orchestration own case logic, deduplication, status, sequencing, and evidence records.
The Archive receives a one-way additive copy. Incoming Archive events may create evidence through the
approved API path but no case decision is made from Box metadata alone.

## Safety rules

- Service credentials are held by the focused Archive service.
- File Requests are copied from an operator-maintained template.
- Event delivery is best-effort and at-least-once: verify signature and timestamp, deduplicate delivery
  and file identity, distinguish upload from move, and make processing idempotent.
- Write operations stay under the configured live mirror root; recovery roots are read-only.
- Automated deletion from Box is prohibited.
- A folder/file link shown to staff is minted by the server after a scope check.

## Consequences

The design deliberately maintains two surfaces: authoritative relational state and an additive content
Archive. Reconciliation is detectable and repairable, but Archive convenience never weakens case or data-
governance rules.
