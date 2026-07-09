# Verification — TKT-143: Pass the resolved provider/VRM into /extract-images so extraction filenames carry real identity

## Verdict
PENDING

## Evidence
- Offline: real-engine tests prove `QDOS_AB12CDE_img_<page>_<n>` stems when both tokens
  are resolved, `AB12CDE_img_…` when only the VRM is, and neutral `img_…` when neither is
  (the TKT-090 rule preserved). Route passthrough contract tested. 16/16 parser tests +
  234 orch tests green.
- Deployed: `cespk-orch-dev` (71) + the parser Function (4, `--build remote`) republished
  2026-07-09; the parser route tolerates old callers (fields optional) and the old parser
  tolerated new callers (unknown body keys ignored) — no deploy-order hazard existed.

## Pending / gaps
- **Live proof outstanding**: the next intake on a RESOLVED provider case whose
  instruction PDF embeds photos should persist evidence rows whose filenames carry
  `<PRINCIPAL>_<VRM>_img_…` (check the case's evidence list / blob names), while an
  unresolved-provider intake keeps neutral stems.

## How to re-verify
After the next resolved-provider intake with embedded images: `SELECT file_name FROM
evidence WHERE case_id = '<id>' AND source_label LIKE 'extracted from %'` (standard
transient-FW path), or read the case's evidence names in the SPA — expect the
principal + compact VRM prefix on the extracted-image stems.
