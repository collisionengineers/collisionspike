# ADR-0014 — Audit is a first-class Case type

**Status:** Accepted; rewritten 2026-07-16 per [Review 160726](../reviews/160726/decisions.md), numbering refined by [ADR-0021](./0021-case-po-marker-taxonomy.md).

## Decision

Model audit work as a Case type, independent of lifecycle status and separate from the standard
instruction parse. It represents a second independent Collision Engineers inspection of a third-party
engineer's report.

The instructing organisation remains the Work Provider. The audited firm is not the provider. The
third-party report is stored as `engineer_report` evidence, never treated as the instruction and never
used to overwrite the instructed case fields.

Audit work takes two shapes:

- **Standard audit** — the Case mints from the audit marker's own sequence under
  [ADR-0021](./0021-case-po-marker-taxonomy.md).
- **QDOS dual "report + audit report"** — one standard-sequence Case is minted and the audit
  deliverable's identifier is *derived* from the same number during review; no second sequence number
  is consumed.

## Marker refinement

`A.` marks an audit of a **repairable** verdict; `AP.` an audit of a **total-loss** verdict. The
deciding fact is the **original engineer's verdict** as stated in the source material — the third-party
report or the work instructions — not the outcome of our audit. Detection may suggest the type; staff
refine it during review when the source cannot distinguish.

Markers are supported only for providers whose real corpus and reviewed business rules establish them.
Known coverage gap: PCH cannot mint `AP.` under the current marker allowlist (TKT-243).

## Consequences

Audit Cases use the shared intake, fields, readiness, and EVA process. The app labels the type clearly
and keeps the comparison report separate. Audit output files into the same Box folder tree as the
original case; a nested `A.<Case/PO>` child folder is the pending refinement (TKT-162).
