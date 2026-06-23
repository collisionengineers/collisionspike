# Inspection-address review — SUPERSEDED

The runtime inspection-address matcher this review covered was **removed root-and-stem on
2026-06-23** (ADR-0013) — it misread `Loc` (an EVA-export artifact) as an intake input.

The live model is the **offline-derived, full-address-only suggestions corpus** → staff **manual
pick** → "Image Based Assessment" with a reason when unclear. There is no runtime matcher. See
`docs/architecture/inspection-address-corpus.md` and
`docs/adr/0013-loc-export-artifact-no-runtime-address-matching.md`.
