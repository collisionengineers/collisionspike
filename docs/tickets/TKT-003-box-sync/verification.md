# Verification — TKT-003: Get .eml / images / instructions into the Box folder

## Verdict
**VERIFIED-LIVE** (2026-07-01) — post-regression fix confirmed on the live stack. Operator re-test after
the `blob_purged_at` predicate fix: intake archive copies `.eml`, instruction document(s), and images into
the case Box folder; `boxArchiveEvidence` completes without 500s. See
[changes-regression-01-07-26.md](./changes-regression-01-07-26.md) for the regression writeup.

## Live evidence (2026-07-01)
- Post-fix intake: case Box folder contains the expected evidence files (`.eml` + instruction doc(s);
  images where applicable).
- `boxArchiveEvidence` durable activity completes on intake (no `internalCasesArchiveEvidence` 500s).
- Regression root cause (dead `evidence.blob_purged_at` predicate from `493433e`/`781f02b`) removed and
  redeployed to `cespk-api-dev` + `cespk-orch-dev`.

## Historical context
- **2026-06-30 (pre-regression):** `QDOS26001` Box folder `395397724540` contained `message.eml` +
  `LtrtoEngineerIn.pdf`; telemetry `{"evt":"boxArchiveEvidence","uploaded":2,"total":2}`; stamping gap
  noted (`box_file_id` / `box_synced_at` NULL) — addressed in the 493433e rework (which then introduced
  the regression fixed 2026-07-01).
- **2026-07-01 regression:** App Insights showed `42703 column "blob_purged_at" does not exist` on every
  archive call since 493433e deploy; fix deployed same day.

## How to re-verify
Run a live intake, list the case Box folder (`.eml` + instruction docs + images), and confirm
`boxArchiveEvidence` `uploaded`/`total` in App Insights. Optionally confirm `evidence.box_file_id` and
`case_.box_synced_at` are populated. Box gate state: see
[live-environment.md](../../architecture/live-environment.md).
