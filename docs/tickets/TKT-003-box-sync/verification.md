# Verification — TKT-003: Get .eml / images / instructions into the Box folder

## Verdict
CODE-FIXED + DEPLOYED, live runtime confirmation PENDING (2026-07-01) — see
[changes-regression-01-07-26.md](./changes-regression-01-07-26.md) for the full regression writeup.
The 2026-06-30 VERIFIED-LIVE verdict below was accurate at the time but was invalidated the same
afternoon by the PR30 review-fix commits (`493433e`/`781f02b`), which broke archiving for every case
via a query against a nonexistent `evidence.blob_purged_at` column. That regression is now fixed and
redeployed (2026-07-01) to `cespk-api-dev` + `cespk-orch-dev`.

## 2026-07-01 regression fix — evidence
- Root-caused via a read-only azure-diagnostician pass: App Insights showed `internalCasesArchiveEvidence`
  500ing with Postgres `42703 column "blob_purged_at" does not exist` on every invocation since the
  493433e deploy; QDOS26004's Box folder (`395696019728`) existed with 0 entries.
- Fix (dead-predicate removal + manual backfill lever) deployed live: `cespk-api-dev` 63 functions,
  `cespk-orch-dev` 50 functions (`box-archive-start` + `boxArchiveEvidenceOrchestrator` confirmed
  registered via `az functionapp function list`).
- **Not yet confirmed with a fresh live 200/upload** — the internal route requires the orchestration
  app's own managed-identity token (not mintable from outside), and App Insights showed no traffic to
  the route in the 48h either side of deploy (no case has hit it yet post-fix). Backfilling the two
  known-affected cases (QDOS26001, QDOS26004) was explicitly decided against — this is a test/dev
  environment; the fix only needs to hold for future intakes.
- Schema-level cross-check: `migration/assets/schema/060_evidence.sql` confirms `evidence` has
  `storage_path`/`box_file_id` (used by the surviving query) and no `blob_purged_at` column — the fix
  matches the canonical DDL.

## Pending / gaps
- **Live confirmation still open**: the next real intake should be checked — its Box folder should
  contain the `.eml` + instruction doc(s) (+ any genuinely photo-sized embedded images, post Fix B),
  and `evidence.box_file_id` / `case_.box_synced_at` should get stamped (the 493433e/781f02b rework's
  intended behaviour, on top of the 2026-06-30 baseline which uploaded but never stamped).
- Superseded 2026-06-30 evidence (pre-regression, `QDOS26001` Box folder `395397724540` contains
  exactly `message.eml` + `LtrtoEngineerIn.pdf`, `{"evt":"boxArchiveEvidence","uploaded":2,"total":2}`)
  retained below for history.

## How to re-verify
Run a live intake to mint a case, then list the Box case folder (confirm it holds the `.eml` +
instruction docs) and compare to the `boxArchiveEvidence` `uploaded`/`total` custom event in App
Insights. Also confirm `evidence.box_file_id` and `case_.box_synced_at` are populated (the specific
gap the 2026-06-30 pass flagged and 493433e/781f02b intended to close).

## Historical: 2026-06-30 evidence (pre-regression, superseded)
Live e2e (2026-06-30, since the 10:21Z clean-slate reset):
- `QDOS26001` Box folder `395397724540` (verified a child of the allowed test root `392761581105`) contains exactly `message.eml` + `LtrtoEngineerIn.pdf`.
- Telemetry: `{"evt":"boxArchiveEvidence","uploaded":2,"total":2}`.
- `boxArchiveEvidence` ran 2× with 0 failures — the first time it has run end-to-end.
DB reads cross-checked against App Insights custom events. Box gate state: see ../../architecture/live-environment.md.
Gap noted then (now folded into the 493433e/781f02b rework, itself the source of the 2026-07-01
regression): `evidence.box_file_id` and `case_.box_synced_at` were still NULL after upload.
