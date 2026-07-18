# ADR-0016 — Inspection-address suggestions are rebuilt from validated full-address exports

**Status:** Accepted (decision proposed 2026-06-24); amended 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

Build the suggestion layer from a reproducible, reviewed export pipeline that retains only full addresses,
normalizes their components, resolves marker-aware provider identity, and calculates transparent frequency
and recency ranking. Preserve confirmed/operator-maintained rows unchanged when refreshing suggestions.

Proximity may order candidates but never select one. Image/location assistance is reviewer-invoked,
returns suggestions only, and cannot designate a provider as always image-based.

## Rationale

The export contains valuable repeated full addresses but also incomplete and misleading location values.
A reproducible filter gives staff useful suggestions without creating an autonomous matcher.

## Consequences

Refresh is backup-first, deterministic, fixture-tested, and auditable. Partial values are rejected. Staff
remain responsible for the final address under [ADR-0013](./0013-loc-export-artifact-no-runtime-address-matching.md).

## Amendment — subset-address merge (2026-07-16)

Some export rows missed the first address line, leaving only a road name and postcode, while other rows
carry the same site's full address — they are the same place. Corpus rows that share a normalised
address line and postcode therefore collapse into one entry labelled with the fullest form, and their
frequencies sum. The current build keys on the exact `(provider, name|line|postcode)` tuple and keeps
them apart (decided 2026-07-16; not built — TKT-238). This explicit merge may later be subsumed by a
broader postcode-matcher consolidation (to be examined in a future PR); if that lands, this amendment
may become unnecessary.
