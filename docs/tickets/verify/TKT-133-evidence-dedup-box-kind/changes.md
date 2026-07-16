# Changes — TKT-133: Evidence dedup + box-webhook kind

> Regression follow-up (2026-07-11): [changes-regression-11-07-26.md](./changes-regression-11-07-26.md)

## Status
Reopened to `now` on 2026-07-11: PR 55 review found that the case-merge route bypassed the established same-case SHA dedup contract. The prior implementation and cleanup record below remains prior evidence.

## Overview
The fix spans the two producers + the writer + a one-off data cleanup:
1. **api** — (case_id, sha256) write-time dedup/LINK on the internal evidence route;
2. **orchestration** — the email-attachment lane now actually SENDS sha256;
3. **box-webhook** — sends the true kind (not hard-coded 'image') AND sha256 at source;
4. **live data** — audited one-off cleanup of the existing email+Box mirror twins.

## Data API — sha256 write-time dedup/link (api workspace)

- `services/data-api/src/features/` — `internalCasesEvidence` (POST /api/internal/cases/{id}/evidence):
  per row, when the caller supplies a plausible sha256 (64-hex, `SHA256_HEX_RE`), an ADDITIONAL
  pre-check runs BEFORE either lane INSERT:
  `SELECT id, box_file_id, box_file_url, storage_path, source_message_id FROM evidence
   WHERE case_id=$1 AND sha256=$2 LIMIT 1` — keyed STRICTLY on (case_id, sha256), never cross-case.
  On a hit with a DIFFERENT identity, the arrival is LINKED, not inserted: a Box arrival fills
  `box_file_id`/`box_file_url` (guarded `AND box_file_id IS NULL`; `source_message_id` untouched —
  it is the existing lane's identity); an email arrival fills `storage_path` (guarded IS NULL);
  incoming image metadata beyond the sha256 is absorbed via the existing `applyEvidenceMetadata`.
  A SAME-identity hit (retry) falls through to the unchanged lane logic (NOT EXISTS no-op +
  metadata update-in-place). Response extended `{ persisted, updated }` → `{ persisted, updated, merged }`
  (additive; orchestration types the response as `{ persisted: number }` — unaffected).
  All pre-existing dedup (source_message_id / box_file_id / storage_path NOT EXISTS) preserved.
- `services/data-api/src/features/evidence/internal-persist-routes.test.ts` — NEW, 7 tests: the acceptance regression
  (email arrival then Box mirror = ONE row, merge UPDATE carries box_file_id), the mirror-first
  direction, NEGATIVE same-sha-different-case inserts normally, no/implausible sha256 = prior
  behaviour, same-identity retry falls through to update-in-place.
- api suite 34 files/352 tests → 36 files/376 tests, green; `tsc -b` green.

## Orchestration — sha256 on the email-attachment evidence lane

The email-attachment lane persisted evidence rows with NO sha256 (only the extracted-image
lane carried one). The hash is now computed at the ONE seam every evidence byte-stream passes
through — blob landing — and carried to the persist call:

- `services/orchestration/src/platform/blob.ts` — `uploadEvidenceBytes` returns `sha256` (hex, node:crypto).
- `services/orchestration/src/workflows/intake/fetchMessage.ts` — envelope `attachments[]` + `rawEml`
  carry optional `sha256` (optional = replay-safe for envelopes checkpointed before the field).
- `services/orchestration/src/workflows/evidence/classifyPersist.ts` — row assembly extracted into the
  exported pure `buildBaseEvidenceRows()` (attachment + raw-`.eml` rows, sha256 carried); the
  ADR-0015 body-instruction row stamps `sha256` from its own upload.
- `services/orchestration/src/adapters/data-api.ts` — `persistEvidence` row type gains optional `sha256`.
- NOT changed: `registerBoxEvidence` (retro lane) registers BYTE-LESS rows from a Box folder
  LISTING (Box exposes sha1, not sha256) — already dedups on `box_file_id`; the `boxArchive`
  activity registers no rows (it stamps existing ones).
- New `classifyPersist.test.ts` (5 cases). Orch suite 262/262 green; `tsc -b` clean.

## box-webhook Function (services/functions/box-webhook/) — honest kind + sha256 at source

- `evidence_kind.py` (new): pure classifier mirroring the Data API/domain mapping exactly
  (packages/domain classification.ts + the TKT-124 re-kind delta): extension PRIMARY
  (jpg/jpeg/png → image; pdf/docx/doc → instruction; eml → email), MIME fallback for
  unknown/absent extensions (image/* wildcard → image; pdf/word → instruction;
  message/rfc822 → email), else other. Never emits engineer_report.
- `function_app.py` `_process_upload`: evidenceClass is now derived from the filename instead of
  hard-coded 'image' (the webhook event carries no MIME); the TKT-095 is_ce_report →
  'engineer_report' override still wins; the API-side TKT-124 writer guard is untouched
  (belt-and-braces, per the ticket).
- sha256 at source: new `_fetch_box_sha256` downloads the just-uploaded file via the existing
  capped `BoxClient.download_file` path (BOX_DOWNLOAD_MAX_BYTES, default 25 MiB) and passes
  sha256 to `create_evidence` — fetched ONLY when the evidence write will actually happen (after
  case-resolve, not on the durable-dedup/triage paths); over-cap or any Box fault → sha256=None
  (honest, never fails the write).
- `data_api_client.py` `create_evidence`: forwards `sha256` onto the wire row (lowercase hex —
  matching the api's exact-match expectation), omitted when None.
- Tests: `services/functions/box-webhook/tests/test_evidence_kind.py` (mapping table) plus
  receiver/data-api-client additions.
  box-webhook pytest 150 → 238, green.

## One-off audited cleanup of existing twins (LIVE, 2026-07-09)

Enumerated live (csadmin read): **62 box-mirror twin rows across 16 cases** — a twin = a
BOX-lane image row (storage_path NULL, box_file_id set) whose (case, base filename — TKT-087
`-<sha1[:8]>` suffix normalised) matches a BLOB-lane image row; A.QDOS26035 (the marker case)
among them. Backup-first (`backup-tkt133-twins-before.csv`), then per pair: the blob survivor
gained the Box provenance (`box_file_id`/`box_file_url` where absent) and the box twin was
soft-merged — `excluded=true, accepted_for_eva=false`, plain-language `exclusion_reason` naming
the survivor — so EVA order/zip shows each photo once (the images route filters excluded).
One `duplicate_dropped` audit_event per affected case. Executed via the transient-FW psql path
(rule added then removed); outputs in this ticket's evidence.

### Live-run addendum (executed 2026-07-09)
- **Pass 1 (blob↔box mirror twins)**: 68 pairs found at run time (live-grown from the 62
  enumerated) → **58 box twins excluded** (10 were already excluded by the TKT-131 pass —
  reflections/non-vehicle), 18 cases audited, 0 survivors needed provenance filled (the orch
  archive already stamps box ids on blob rows). Remaining active blob↔box twins: **0**.
- **Pass 2 (box↔box same-name duplicates — a SECOND duplication class the marker case
  exposed)**: the retro Box-folder registration lane had double-registered files broadly —
  **1,411 duplicate rows excluded across 111 cases** (exact-same file_name, same case, both
  byte-less box rows; keeper = earliest; per-case `duplicate_dropped` audits; backup
  `evidence/backup-boxbox-before.csv`). This was 24× the visible sample — the real fix.
- **Statuses re-evaluated after the dedup** (the recorded pattern, audited): 2 cases moved
  (`missing_required_fields → needs_review`); NO case regressed out of `ready_for_eva` — no
  readiness had depended on a duplicate row.
- **Marker case A.QDOS26035**: EVA-order view now shows each accepted photo exactly once
  (7 photos; the two remaining same-name actives are `accepted_for_eva=false` letterhead
  extracts that never reach EVA order).
- **Honest remainder**: 214 same-name active rows remain in the BLOB↔BLOB class (the same
  filename re-attached across different emails) — indistinguishable from genuinely distinct
  photos without a byte-hash backfill over prior blob rows (they predate sha256 stamping);
  new-ticket candidate.

## Remainders
- Live twin-collapse proof (email + Box mirror → ONE row) needs the deploys (api + orch +
  box-webhook) and a real intake — PENDING.
- Files over the 25 MiB download cap get sha256=NULL at the box source and won't dedup-link
  (metadata-only hash unavailable from Box) — accepted, recorded.
- Write-time merges are not audited on the api route (evidence inserts never were) — candidate
  follow-up if merge visibility in the activity feed is wanted.
- `evidence-upload.ts` (staff/assistant upload) and `provider-intake.ts` compute sha256 but have
  no dedup of their own — out of this ticket's email+Box-twin scope; candidate follow-up.
