# Changes — TKT-168: Make Not Ready status language agree with the queue

## Status
Implemented offline; deployment and independent live verification remain.

## Planned scope
- The shared case-status badge translates the generic stored `needs_review` value to “Not ready”.
- The shared Not Ready reason label uses the same wording, so the reason chip and status filter agree.
- Added rendered regression coverage for the generic and specific case statuses. Field-level review
  provenance and persisted status codes are unchanged.

## Offline verification
- Domain: 54 files / 1,132 tests passed.
- SPA: 42 files / 469 tests passed.
- Domain and production SPA builds passed; ticket and documentation gates passed.

## Follow-up scope — 2026-07-13

The new operator note requires specific blocker wording, not merely replacing “Needs review” with generic
“Not ready”. The existing offline implementation has not yet proven deterministic multi-blocker summaries,
full reason discovery or the live specific-reason matrix.
