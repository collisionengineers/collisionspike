# Verification — TKT-225: retro related-correspondence ingest

## Status
LIVE-VERIFIED (core chain) 2026-07-17 — offline acceptance green at commit `58d7ca09`
(2,667 vitest across the four workspaces; generator/route suites listed in changes.md), and the
ingest chain proved itself at sweep scale the same night. One adjacent gap ticketed (below).

## Live evidence (sweep window 2026-07-17 01:26–03:05Z; gate lit 02:05Z)
- Gate-off dark deploy first, then `RETRO_RELATED_INGEST_ENABLED=true` on `cespk-orch-dev` only.
- **The child ran 36 times** during the 286-row backlog sweep, with **75 `retroBackfillFields`
  events**. Proof lines (banked in the sweep artifacts + `ingest-proof-lines.json`):
  - `01:43:46Z {"evt":"retroRelatedIngest","caseId":"03da61a3-…","processed":2,"failed":0,"fieldsApplied":1}`
    with paired `{"evt":"retroBackfillFields","outcome":"applied","vrmFilled":false}` — a related
    email genuinely back-filled a gap field on a fresh reconstruction.
  - `01:46:14Z {"evt":"retroRelatedIngest","caseId":"c8eed872-…","processed":1,"failed":0,"fieldsApplied":0}`
    — the honest noop path.
- **Fill-gaps provenance proven in the DB** (independent diagnostician, fresh SELECTs ~04:15Z):
  SWAN26007 carries `field_level_provenance` rows for claimantName / claimantTelephone /
  dateOfLoss whose `source_reference` is a related email's Internet-Message-Id; 7 of 8 sampled
  window-created cases carry related-email-sourced provenance rows. Zero overwrites of set
  values observed; every blob-lane evidence row carries sha256.
- **Rung-1 dedupe pinned live**: force re-drive of the already-reconstructed FW26029 trigger →
  `linked` at rung 1, no double-run, ingest seam not entered (by design — the rung-1
  related-backfill is the documented follow-up seam).

## Adjacent gap (ticketed in the post-sweep remediation batch)
The rung-1 linked lane never mirrors freshly persisted evidence to a writable Box folder
(SWAN26007's rung-1 email pair has `box_file_id` NULL; the archive-mirror-monitor is
outbox-driven and does not cover it) — SPA shows honest "Not archived" markers. Conditional
`boxArchiveEvidence` on the writable-folder rung-1 path is planned alongside the other
post-sweep fixes.

## Re-verify
KQL (orchestration app): `traces | where message has "retroRelatedIngest"` /
`"retroBackfillFields"` over any drain window; DB: `field_level_provenance` rows whose
`source_reference` matches a related row's Internet-Message-Id; idempotency: a force re-run of
the same case yields all-noop backfills and zero new evidence inserts.
