# ADR-0013 — `Loc` is an export artifact, not an intake address

**Status:** Accepted (2026-06-23).

This decision supersedes the earlier runtime address-matching proposal and the corresponding
“address match is live” statement in Review 190626. The supersession applies only to automatic
address resolution; it does not remove the staff-facing address corpus or suggestion assistance.

## Decision

Do not treat the EVA `Loc` value as an intake field and do not derive an inspection address from it at
runtime. Staff select or edit a full address from the curated corpus or deliberately choose
`Image Based Assessment` with a reason.

A reviewer-invoked location assistant may rank or suggest candidates using current case evidence, but it
never auto-applies an address. A suggestion miss leaves the decision unresolved.

## Rationale

`Loc` is frequently an outward postcode or other incomplete export value. Converting it to a full address
creates false precision and can select the wrong location.

## Consequences

Only validated full addresses enter the suggestion corpus. Partial postcodes may assist search but are
not promoted. The product retains a live staff-facing address aid without a hidden auto-resolver.

Suggestion ordering by provider history, frequency, recency, or proximity is permitted because it changes
only what staff see first. A reviewer-invoked location assistant may also propose candidates from case
evidence. Neither path may select or persist an address without staff confirmation.

## Amendment — provider-policy image-based pre-fill (2026-07-08)

The later operator direction for provider-policy image-based work supersedes the manual-only reading of
this ADR for providers whose recorded `inspection_location_policy` is `always_image_based`. When the
inspection field is empty, status evaluation may fill it with `Image Based Assessment`, set the matching
decision code and provenance, and write the inspection-override audit with the reason
`Provider policy: image-based assessment`. Staff can still replace that result with a physical address.

This amendment does not permit an automatic physical-address matcher. Providers with `prefer_address`
or `required_address` retain the staff-confirmed address flow, and every policy-filled image-based outcome
must retain its reason and audit trail.
