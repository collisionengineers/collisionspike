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

Correlation turns on the **incident date**, not on when the mail or images arrived. A different incident
date means a different incident, so a mismatch **eliminates** a candidate. The same incident date does
not prove the same incident — one vehicle can be in two accidents on the same day — so a same-date match
never merges on its own; it needs a corroborating signal (a provider reference, the accident
circumstances, or third-party details) before it can attach, and stays two visible cases until one is
found. Never merge merely because a VRM and an arrival time are close, and never cross Work Providers
without explicit evidence.

## Rationale

One vehicle can have multiple genuine claims, even on the same day. The incident date discriminates one
incident from another; arrival-time proximity does not, and time-window matching can silently combine
unrelated work.

## Consequences

Merges are logged and reversible. Locks and stable operation identities prevent concurrent duplicate
effects. The safe failure mode is two visible Cases, not one corrupted Case.
