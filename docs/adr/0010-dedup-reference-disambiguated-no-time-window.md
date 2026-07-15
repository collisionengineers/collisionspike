# ADR-0010 — Deduplication is reference-aware and never time-window-only

**Status:** Accepted (2026-06-17).

## Decision

- Exact message identity or payload-hash repeat: drop as a true duplicate.
- Matching Case/PO: attach to that Case, subject to integrity checks.
- Matching provider-scoped external reference: attach when the result is unique.
- Different references on the same VRM: preserve as distinct cases and surface the collision.
- No reference plus one compatible open-case VRM candidate: propose or perform only the specifically
  approved complementary-evidence link.
- More than one candidate: require staff review.

Never merge merely because VRM and arrival time are close, and never cross Work Providers without
explicit evidence.

## Rationale

One vehicle can have multiple genuine claims, including close in time. Time-window matching can silently
combine unrelated work.

## Consequences

Merges are auditable and reversible. Locks and stable operation identities prevent concurrent duplicate
effects. The safe failure mode is two visible Cases, not one corrupted Case.
