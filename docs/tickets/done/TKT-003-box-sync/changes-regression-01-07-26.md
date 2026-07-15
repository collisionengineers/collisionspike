# TKT-003 follow-up — 2026-07-01 regression + junk-image co-discovery

## Trigger
User report: box sync "still not occurring" on a fresh case (QDOS26004, VRM WH19NXW), plus an
incorrect image stored on that case (`LtrtoEngineerIn__RJS_UnknownVRM_img_1_3`).

## Root cause A — box sync 500s on every case since the 493433e/781f02b deploy
`493433e` ("fix(pr30): address review feedback", 2026-06-30 13:53) reworked the orchestration's
`boxArchiveEvidence` activity to read persisted evidence via a new Data API route,
`GET /api/internal/cases/{id}/archive-evidence` (`services/data-api/src/features/`) — the correct
design (it's what makes images + `box_file_id`/`box_synced_at` stamping possible). That query
included `AND blob_purged_at IS NULL`, referencing a column that was **never migrated** onto the
`evidence` table (`database/baseline/060_evidence.sql` has no such column) and doesn't exist
on live Postgres either. Confirmed live via a read-only azure-diagnostician pass: every call to the
route 500ed with Postgres `42703 column "blob_purged_at" does not exist`, and `boxArchive.ts`
swallowed the 500 as `{skipped:'evidence_unreadable'}` — the Durable activity still reported
`Succeeded`, so the failure was invisible. QDOS26004's Box folder (`395696019728`) existed but had
0 entries — nothing had landed since the 493433e deploy, not just for this case.

The column was never actually needed: the Box-blob purge flow
(`internalBoxPurgeCandidates`/`internalBoxMarkPurged`, same file) tracks "purged" by clearing
`storage_path` to `NULL`, not via a timestamp — and only ever purges rows where `box_file_id IS
NOT NULL`. A row matching the archive filter's `box_file_id IS NULL` can therefore never have been
purged; `storage_path IS NOT NULL` already excludes purged rows. `blob_purged_at IS NULL` was dead,
redundant logic.

### Fix
- `services/data-api/src/features/` — removed the dead `AND blob_purged_at IS NULL` predicate. No
  schema migration needed.
- `services/orchestration/src/workflows/archive/boxArchive.ts` — added a manual backfill lever
  (`box-archive-start`, `POST /api/box-archive {caseId}`, mirroring the existing
  `box-folder-create-start` pattern) so an operator can re-run the archive for one case without a
  full re-intake. **Auth:** set to `authLevel: 'function'` (not `'anonymous'` like the other manual
  starters it mirrors) since it triggers a real Box upload + Postgres write for a caller-supplied
  `caseId` — a function key is required to invoke it. The underlying Box client independently
  hard-scope-locks every operation to `BOX_ALLOWED_ROOT_ID` regardless (`box_client.py:595`
  `_assert_in_scope`), so even before this auth was added the blast radius was bounded to the test
  folder, never arbitrary Box locations.
- Deployed live to `cespk-api-dev` (63 functions) and `cespk-orch-dev` (50 functions,
  `box-archive-start` + `boxArchiveEvidenceOrchestrator` confirmed registered) via
  `az functionapp deployment source config-zip` (the `func` CLI fallback for this WSL environment).
- **Backfill of QDOS26001/QDOS26004 explicitly skipped per user decision (2026-07-01)** — this is a
  test/dev environment; the fix only needs to hold for future intakes, not backfill the two cases
  hit during the outage window (2026-06-30 13:53 → 2026-07-01 fix deploy).

## Root cause B — decorative images extracted from instruction PDFs (co-discovered, separate bug)
`extractImages` (`services/orchestration/src/workflows/evidence/extractImages.ts`) runs on any PDF/DOC/DOCX
attachment, including plain-text instruction letters with no vehicle photos. The underlying engine
(`cedocumentmapper_v2`'s `extract_images()`) extracted **every** embedded raster on every page with
no filtering — letterhead logos, signature stamps, etc. — persisted as `imageRoleCode:'unknown'`,
`acceptedForEva:false` evidence rows (e.g. `LtrtoEngineerIn__RJS_UnknownVRM_img_1_3`). Doesn't corrupt
EVA-readiness (already excluded by `acceptedForEva`), but clutters the evidence gallery and — once
Fix A shipped — would also get faithfully mirrored into Box.

### Fix
Added a minimum-pixel-area filter (200×200 floor) to `extract_images()` in the `cedocumentmapper_v2.0`
sibling (`application/service.py`, both the PyMuPDF/`fitz` path and the `pypdf` fallback — the DOCX
media path is unchanged, lower-risk/out of scope), then re-vendored into
`services/functions/parser/cedocumentmapper_v2/`. Two new regression tests added to
`services/functions/parser/tests/test_extract_images.py`
(`test_small_decorative_image_is_filtered_out`, `test_large_embedded_image_is_kept`) using
synthetic PDFs built with PyMuPDF, so the fix doesn't depend on a specific fixture file. Full parser
suite: 232 passed, 2 skipped (unrelated, missing dev-only fixtures).

## Files touched
- `services/data-api/src/features/`
- `services/orchestration/src/workflows/archive/boxArchive.ts`
- `services/functions/parser/tests/test_extract_images.py`
- `../cedocumentmapper_v2.0/src/cedocumentmapper_v2/application/service.py` (sibling, authoring
  source of truth) → re-vendored to `services/functions/parser/cedocumentmapper_v2/application/service.py`

## Status of this follow-up
Deployed live 2026-07-01. Not yet git-committed. Live runtime confirmation (a real intake producing
a non-500 archive + populated Box folder) is pending the next live email intake — not forced via
backfill per the above decision. If the next live case still shows an empty Box folder, re-open.
