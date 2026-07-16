# ADR-0002 — VRM correlation is scoped to compatible open cases

**Status:** Accepted (2026-06-17), refined by [ADR-0010](./0010-dedup-reference-disambiguated-no-time-window.md).

## Decision

Use VRM to find compatible open-case candidates for separately arriving instructions and images. Multiple
historical or same-day cases may share a VRM. Ambiguous candidates go to staff review rather than being merged automatically.

## Rationale

Images-first arrivals may have no provider reference, so VRM is a necessary signal. It cannot be the Case
identity because a vehicle can have several unrelated claims or inspections.

## Consequences

Correlation must consider case state, evidence composition, provider/reference signals, and ambiguity.
The safe failure mode is visible duplicate work for a person to resolve, not a wrong merge.
