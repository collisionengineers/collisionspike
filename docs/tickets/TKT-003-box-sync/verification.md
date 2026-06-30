# Verification — TKT-003: Get .eml / images / instructions into the Box folder

## Verdict
VERIFIED-LIVE

## Evidence
Live e2e (2026-06-30, since the 10:21Z clean-slate reset):
- `QDOS26001` Box folder `395397724540` (verified a child of the allowed test root `392761581105`) contains exactly `message.eml` + `LtrtoEngineerIn.pdf`.
- Telemetry: `{"evt":"boxArchiveEvidence","uploaded":2,"total":2}`.
- `boxArchiveEvidence` ran 2× with 0 failures — the first time it has run end-to-end.
DB reads cross-checked against App Insights custom events. Box gate state: see ../../architecture/live-environment.md.

## Pending / gaps
NON-BLOCKING follow-up (owner: azure-integration-engineer): after a successful upload, `evidence.box_file_id` and `case_.box_synced_at` are still NULL — the upload works but the per-file Box id and sync timestamp are not written back. Low severity.

## How to re-verify
Run a live intake to mint a case, then list the Box case folder (confirm it holds the `.eml` + instruction docs) and compare to the `boxArchiveEvidence` `uploaded`/`total` custom event in App Insights.
