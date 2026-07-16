# ADR-0021 — Case/PO markers have independent sequences

**Status:** Accepted (2026-07-03), extending [ADR-0014](./0014-audit-case-type-second-inspection.md).

## Decision

Case/PO case-type markers are:

| Case type | Marker |
| --- | --- |
| Standard | none |
| Audit | `A.` |
| Audit total loss | `AP.` |
| Diminution | `D.` |

Each marker has its own per-provider, per-year sequence. The same identifier renders lowercase for EVA and
uppercase for the Archive.

For the QDOS dual “report + audit report” instruction, mint one standard-sequence Case and derive the
audit deliverable identifier from the same number during review. Do not consume a second audit-sequence
number.

Markers are supported only for providers whose real corpus and reviewed business rules establish them.
Parser detection may suggest a type; staff can refine it when the source cannot distinguish, especially
audit total loss.

## Consequences

Sequence allocation is transactional and unique by provider, year, and marker. Detection, formatting,
database constraints, EVA output, Archive folder naming, and snapshots share one marker table.
