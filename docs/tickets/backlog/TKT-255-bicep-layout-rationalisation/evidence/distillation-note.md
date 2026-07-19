# Distillation note — TKT-255

**Source:** `03-cloud-estate-cleanup.md` scope item 4. **Plan:** PLAN-009. Verified read-only 2026-07-19
(`PLAN-009.dossier.json`).

**Two coexisting bicep conventions:**
- Central: `infrastructure/config-capture/api.bicep`, `orch.bicep`, `spa.bicep`.
- Per-service: `services/functions/*/infra/main.bicep` (box-webhook, eva-sentry, location-assist, ocr,
  parser, vehicle-enrichment).

**TKT-206 collision:** the governing review (`docs/reviews/160726/checklist.md` §c) assigns a
dangling-`ADR-0017`-citation sweep to TKT-206 riders across the per-service bicep. Factually the dangling
`ADR-0017` retention citations appear in five files (box-webhook, eva-sentry, location-assist, parser,
vehicle-enrichment); the OCR bicep carries none. TKT-206 is in `now` but its bicep riders are "not started".
So this ticket and TKT-206 will edit the same five files — coordinate ordering/partition.

**ADR:** `ADR-0017` was withdrawn (sequence jumps 0016→0018). The platform-topology ADR that frames the
layout choice does **not** exist yet; TKT-246 mints it (reserved range 0026–0030, numbers unassigned). This
ticket amends that ADR once minted — hence the TKT-246 gate. Do not pre-assign the number.
