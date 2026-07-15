# ADR-0013 — `Loc` is an export artifact, not an intake address

**Status:** Accepted (2026-06-23).

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
