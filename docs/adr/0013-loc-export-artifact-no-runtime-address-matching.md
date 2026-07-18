# ADR-0013 — The inspection address is a staff decision from the full-address corpus

**Status:** Accepted; rewritten 2026-07-16 per [Review 160726](../reviews/160726/decisions.md). Supersedes the earlier runtime address-matching proposal and the corresponding "address match is live" statement in Review 190626 (automatic resolution only; the staff-facing corpus and suggestion assistance stand).

## Decision

Staff select or edit the inspection address from the curated full-address corpus, or deliberately choose
`Image Based Assessment` with a reason. Nothing auto-applies a physical address.

A reviewer-invoked location assistant may rank or suggest candidates using current case evidence, but it
never auto-applies an address. A suggestion miss leaves the decision unresolved. Suggestion ordering by
provider history, frequency, recency, or proximity is permitted because it changes only what staff see
first. Neither path may select or persist an address without staff confirmation.

The provider-policy amendment below is consistent with this rule: a policy-driven `Image Based
Assessment` fill is a recorded **non-address outcome**, not an address selection — so it does not breach
"never auto-apply an address".

## Rationale

Collision Engineers work desktop-only — no one is dispatched to a site — so the inspection address is a
field in the report, not a destination. Deriving it from partial or export-quality values creates false
precision that corrupts report correctness. Only validated full addresses are worth suggesting, and only
a person should commit one.

## Consequences

Only validated full addresses enter the suggestion corpus ([ADR-0016](./0016-inspection-address-corpus-eva-export.md)).
Partial postcodes may assist search but are not promoted. The product retains a live staff-facing
address aid without a hidden auto-resolver. The filename keeps its historical slug by design: number
citations and ticket records bind to it.

## Retired: `Loc`

The EVA `Loc` export value was never an intake field, and the mechanism around it is now inert: no
writer emits `loc=` and the stored value has no consumers. `Loc` plays no part in the address decision;
residual code is removed under TKT-243.

## Amendment — provider-policy image-based pre-fill (2026-07-08)

The later operator direction for provider-policy image-based work supersedes the manual-only reading of
this ADR for providers whose recorded `inspection_location_policy` is `always_image_based`. When the
inspection field is empty, status evaluation may fill it with `Image Based Assessment`, set the matching
decision code and provenance, and write the inspection-override audit with the reason
`Provider policy: image-based assessment`. Staff can still replace that result with a physical address.

This amendment does not permit an automatic physical-address matcher. Providers with `prefer_address`
or `required_address` retain the staff-confirmed address flow, and every policy-filled image-based outcome
must retain its reason and audit trail.
