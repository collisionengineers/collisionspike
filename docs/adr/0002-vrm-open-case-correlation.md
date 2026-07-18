# ADR-0002 — VRM correlation is scoped to compatible open cases

**Status:** Accepted; rewritten 2026-07-16 per [Review 160726](../reviews/160726/decisions.md), refined by [ADR-0010](./0010-dedup-reference-disambiguated-no-time-window.md).

## Decision

Use VRM to find compatible open-case candidates for separately arriving instructions and images.
Multiple historical or same-day cases may share a VRM. Ambiguous candidates go to staff review rather
than being merged automatically.

For an image-first case — one that begins with photographs and no instruction — the registration is the
case's **temporary identity** until the instruction arrives and the correlation rules attach or mint the
real Case. Adoption of held image evidence into an instructed case runs through the archive-holding
path, which records what was held, what was adopted, and why.

Two concurrent active image-first cases on the same registration take `-002`/`-003` suffixes so their
working folders and evidence never collide (decided 2026-07-16; not built — TKT-239).

Candidate elimination is deliberately narrow. Built today: a conflicting provider-scoped reference
eliminates a candidate. Decided but not built (TKT-240): an incident-date mismatch and a conflicting
principal may each **eliminate** a candidate. No eliminator ever merges; merging follows
[ADR-0010](./0010-dedup-reference-disambiguated-no-time-window.md) only.

## Rationale

Images-first arrivals may have no provider reference, so VRM is a necessary signal — and until an
instruction arrives it is the only identity the work has. It still cannot be the Case identity proper,
because a vehicle can have several unrelated claims or inspections.

## Consequences

Correlation must consider case state, evidence composition, provider/reference signals, and ambiguity.
The safe failure mode is visible duplicate work for a person to resolve, not a wrong merge. Suffixed
image-first cases collapse to one Case on adoption, with the suffix and the adoption recorded.
