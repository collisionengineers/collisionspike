# ADR-0010 — Deduplication is reference-aware and never time-window-only

**Status:** Accepted; rewritten 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

- Exact message identity or payload-hash repeat: drop as a true duplicate.
- Matching provider-scoped external reference: attach when the result is unique.
- Matching Case/PO: attach subject to integrity checks — and treat this rung as weak, because
  providers quote their own references, not our Case/PO numbers.
- Different provider references on the same VRM: two distinct cases. Keep both visible; this is
  normal, not a fault.
- No reference plus one compatible open-case VRM candidate: propose or perform only the specifically
  approved complementary-evidence link.
- More than one candidate: require staff review.

Time is asymmetric: an incident-date mismatch may **eliminate** a candidate, but closeness in time
never merges one. Never merge merely because VRM and arrival time are close, and never cross Work
Providers without explicit evidence.

## Rationale

One vehicle can have multiple genuine claims, including close in time — two unique provider references
on the same VRM are simply two instructions. Time-window matching can silently combine unrelated work.

## Consequences

Merges are auditable and reversible. Locks and stable operation identities prevent concurrent duplicate
effects. The safe failure mode is two visible Cases, not one corrupted Case.
