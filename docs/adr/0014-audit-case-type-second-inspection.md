# ADR-0014 — Audit is a first-class Case type

**Status:** Accepted (2026-06-23), numbering refined by [ADR-0021](./0021-case-po-marker-taxonomy.md).

## Decision

Model audit work as a Case type, independent of lifecycle status and separate from the standard
instruction parse. It represents a second independent Collision Engineers inspection of a third-party
engineer's report.

The instructing organisation remains the Work Provider. The audited firm is not the provider. The
third-party report is stored as `engineer_report` evidence, never treated as the instruction and never
used to overwrite the instructed case fields.

## Consequences

Audit Cases use the shared intake, fields, readiness, and EVA process. The app clearly labels the type and
keeps the comparison report separate. Detection may suggest audit; a person can refine the type,
including total-loss audit, during review.
