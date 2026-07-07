# Operator plan excerpt — Phase E: UI polish + provider policy

> From `PLAN-inspection-address-repair.md` (investigation/planning session 2026-07-06). The full
> plan is preserved at
> [TKT-075 evidence](../../../done/TKT-075-inspection-corpus-pipeline/evidence/operator-note.md).

Root cause 6 (minor, verified): the decision save upserts on `UNIQUE(label)`, so two cases
confirming the same address share one row (per-case trace only via `source_note` + audit) —
acceptable, but worth a note; provider `inspectionLocationPolicy` (always_image_based etc.) is
in the corpus + mapper but not surfaced in the CaseDetail confirm path.

Plan:

- Plumb the provider's real `inspectionLocationPolicy` into the CaseDetail address flow: an
  "Image Based Assessment (provider default)" chip for operator-designated `always_image_based`
  providers (surfaced, never auto-applied); `required_address` keeps the audited-override
  semantics.
- Suggestion rows: distance hint, provider chip, capped list with "show more".
