# Incident summary — FW26029 reconstruction, 2026-07-16 (evidence bank)

Dated narrative of the live chain that exposed the two defects this ticket fixes. All timestamps
UTC, captured same-day from Application Insights (free-tier retention shrinks intra-day — these
excerpts are the durable copy; the DB rows remain the durable data layer).

Case: `FW26029`, case id `62778371-3e8b-4a8a-9138-f131ec652a3a`.

## The chain

1. **22:53:49** — retro reconstruction begins: `retroResolveExisting` outcome `none` (no existing
   case), then `retroOutlookLocate` finds the source email (`matchedKey: external_ref`, mailbox
   `engineers@`), `retroBoxLocate` finds nothing (46 candidates scanned), plan arm `outlook_only`.
   → [fw_retro2_orch.json](./fw_retro2_orch.json) (produced by [fw_retro2.kql](./fw_retro2.kql)),
   rows 22:53:49–22:53:57.
2. **22:54:02** — `retroCreate` / `retroCreatePersist` outcome `created`, Case/PO `FW26029`,
   `reconstructionSource: outlook`. → same file; also visible API-side in
   [fw_api_traces.json](./fw_api_traces.json) (produced by [fw_api.kql](./fw_api.kql)).
3. **22:54:03** — `classifyPersist` persists **2 evidence rows** for the source email: the `.eml`
   message itself plus the extracted body text (`classifyPersist.bodyInstruction`, 2226 bytes).
   The email had **zero image attachments**. → fw_retro2_orch.json.
4. **22:54:08–22:54:11** — Archive mirror: `boxFolderCreate` creates Box folder `400654960481`,
   then `boxArchiveEvidence` uploads the same 2 files (`uploaded: 2, total: 2` — the Box 201s).
   → fw_retro2_orch.json.
5. **22:54:14/16** — Box fires `FILE.UPLOADED` for each mirrored file; the box-webhook resolves
   folder `400654960481` → the case, POSTs the evidence rows (which the Data API's TKT-133
   write-time `(case_id, sha256)` dedup collapses onto the classifyPersist twins:
   `merged=1, persisted=0`), and **unconditionally stamps a `box_upload_received` audit row per
   delivery**. The webhook window queries are banked as [fw_boxwh.kql](./fw_boxwh.kql) /
   [fw_boxwh2.kql](./fw_boxwh2.kql) (window pattern: [fw_window.kql](./fw_window.kql)).
6. **Queue render** — the case's newest activity row is now a `box_upload_received` audit, and
   `services/data-api/src/shared/last-activity.ts` hard-mapped that action to **"Images
   received"**. The FW26029 queue chip claimed images arrived; the case had none. Second
   retro pass at 22:54:15 (`retroResolveExisting` outcome `linked`, re-upsert `persisted: 2`)
   confirms idempotent behaviour, not extra images. → fw_retro2_orch.json;
   [fw_retro_orch_result.json](./fw_retro_orch_result.json) is the earlier same-day
   orchestration window for contrast.

## Defect A — dishonest Box-upload labels

- The webhook already computes the true evidence class (`classify_evidence_kind(filename)`) and
  passes it to `create_evidence`, but the audit write discards it: every FILE.UPLOADED lands as
  `box_upload_received` and renders "Images received" regardless of what the file was — for
  FW26029, an `.eml` and a `.txt` produced by the system's own archive mirror.
- The mirror signal already exists server-side: the evidence persist route returns `merged` (sha256
  content twin already on the case). In this chain both deliveries were `merged=1, persisted=0` —
  the system's own echo, auditable as such.

## Defect B — `retro_related` subtype silently nulls

- The TKT-222 link-related lane stamps `subtype: 'retro_related'`
  (`services/data-api/src/features/inbound/routes.ts` lane; see `retro-routes.ts`), but no
  `choice_inbound_subtype` row and no `INBOUND_SUBTYPE_TO_INT` entry existed for that name:
  `upsertInboundEmail` mapped it to `null` silently and rows rendered "Unidentified" in the SPA.
- This run linked 0 related rows (`retroLinkRelated linked: 0, scanned: 1` — the single candidate
  was the original instruction itself), so the FW26029 chain shows the *mechanism*; earlier drained
  reconstructions (TKT-222 verification) carry the silently-nulled rows the corrective backfill
  re-stamps.
- Triage-decision context for the same evening is banked in
  [fw_triage_images.json](./fw_triage_images.json) /
  [fw_triage_result.json](./fw_triage_result.json) (produced by
  [fw_triage_images.kql](./fw_triage_images.kql)): the vendored classifier's
  `images_received`/`imagesOnly` handling did **not** fire for FW26029 — that precision gap is a
  documented follow-up, not part of this ticket.

## Why read-time healing

Audit rows are append-only (RLS-enforced no-update). The fix marks new audits with
`{filename, evidenceClass, origin}` in `after` and derives the label at read time; legacy rows
(including FW26029's) self-heal by parsing the filename out of the audit `name`
(`box_upload_received: <filename>`) and classifying via the one shared extension table
(`@cs/domain` `describeEvidence`). No data mutation, no reclassification.
