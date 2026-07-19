# Distillation note — TKT-255

**Source:** `03-cloud-estate-cleanup.md` scope item 4. **Plan:** PLAN-009. Verified read-only 2026-07-19 —
banked in the [PLAN-009 live-verification dossier](../../../plans/PLAN-009.dossier.md).

**Two coexisting bicep conventions:**
- Central: `infrastructure/config-capture/api.bicep`, `orch.bicep`, `spa.bicep`.
- Per-service: `services/functions/*/infra/main.bicep` (box-webhook, eva-sentry, location-assist, ocr,
  parser, vehicle-enrichment).

**TKT-206 collision:** the governing review (`docs/reviews/160726/checklist.md` §c) assigns the sweep to
TKT-206 riders across **all six** per-service `main.bicep` "retention parameters". Factually the literal
`ADR-0017` retention citations appear in five files (box-webhook, eva-sentry, location-assist, parser,
vehicle-enrichment); the OCR bicep carries neither the citation nor a retention parameter. That code reality
does **not** narrow the binding review scope: TKT-206 owns a rider on all six, so this ticket coordinates on
all six and flags the OCR discrepancy to TKT-206 / the operator rather than dropping OCR. TKT-206 is in `now`
but its bicep riders are "not started". So this ticket and TKT-206 will edit the same files — coordinate
ordering/partition across all six.

**ADR:** `ADR-0017` was withdrawn (sequence jumps 0016→0018). The platform-topology ADR that frames the
layout choice does **not** exist yet; TKT-246 mints it (reserved range 0026–0030, numbers unassigned). This
ticket amends that ADR once minted — hence the TKT-246 gate. Do not pre-assign the number.
