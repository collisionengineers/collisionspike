# ADR-0008 — Product responsibility runs to confirmed report delivery

**Status:** Accepted; rewritten 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

The product owns intake, case assembly, parsing, enrichment, review, readiness, EVA handoff, Archive
filing, and **confirmation that the finished report was delivered**. A Case reaches its terminal `done`
state when delivery is confirmed by any of three detectors — the report email is seen in sent items, the
report PDF appears in the Case's Archive folder, or the EVA poll reports completion — or when staff mark
it done directly.

The product also tracks work that arrives **before** a case — chiefly a **triage request**, where a
provider asks for an initial call on whether a vehicle is repairable or a total loss and roadworthy or
not. A triage request is recorded work in its own right, whether or not it goes on to become a full case.

Engineer assessment and report authoring are outside the product **at this time** — they are handled
primarily by EVA (and some by Audatex). The product observes that the report went out; it never produces
or edits the report today. Bringing assessment and report authoring into scope is an intended future
expansion, not a current capability.

## Rationale

The product exists to solve the case-preparation bottleneck without duplicating the specialist
assessment system. Stopping at handoff, however, left the business blind to whether the finished report
actually reached the provider — delivery confirmation closes that gap without touching the engineers'
process.

## Consequences

`done` is the terminal milestone, and a triage request is the earliest tracked point. The system may
retain later inbound mail for record-keeping, linking, or retroactive reconstruction. The filename of this ADR keeps its pre-rewrite slug by design: number
citations bind, and ticket records cite the path.
