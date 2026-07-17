# TKT-229 research note — post-sweep three-agent audit, 2026-07-16 (distilled)

Distills the TKT-229 portion of the 2026-07-16 three-agent audit of PR #102
(`feat/tkt-219-retro-parallel-reconstruction`) that produced the post-sweep remediation plan.

## Proven sequence (why the label never fires)

1. `boxArchiveEvidence` (orchestration, `mirrorArchiveItems` → `stampArchivedEvidence`) uploads
   the case's evidence into the writable archive folder and stamps `box_file_id` onto the
   EXISTING evidence row per upload.
2. Box's FILE.UPLOADED webhook arrives 3–6 s later and POSTs the same file (with the receiver's
   capped-download sha256) to `POST /api/internal/cases/{id}/evidence`.
3. The TKT-133 (case_id, sha256) twin lookup finds the stamped row. `sameIdentity` evaluates
   true via `ex.box_file_id === boxFileId` (the mirror stamped it in step 1).
4. The sameIdentity branch absorbs metadata and `continue`s **without touching `merged`** —
   correct dedup, but the response is `{persisted: 0, merged: 0}`.
5. `function_app.py` derived `origin` from `merged > 0 and persisted == 0` → `external_upload`.
   TKT-226's acceptance-2 label (`archive_mirror` → "Archived") therefore NEVER fired on the
   live echo sequence; it could only fire on the cross-lane shape (twin not yet stamped).

## The duplicate-audit half

- `evidence_exists_for_box_file` (data_api_client.py) always returned False by design (an
  interface-compat shim from the receiver's earlier architecture); the comment at
  function_app.py ("only on a fresh Evidence write — the append-only audit row is not
  re-emitted on a dedup retry") was therefore false. Every Box redelivery re-audited.
- The audit criterion cannot be "fresh row written": a mirror echo never writes a fresh row,
  yet TKT-226 acceptance 2 requires the `origin='archive_mirror'` audit to EXIST. Hence the
  once-key design: key once-ness on the Box file id, enforced server-side in `internalAudit`.

## Discriminator rationale (mirrored)

- Box-lane rows are written with `storage_path NULL` (bytes mirror to Blob later on the
  finalize/parser path). The email/blob lane writes `storage_path`.
- Therefore, on a Box-lane delivery, a twin with `storage_path IS NOT NULL` proves the system
  already owned the bytes through the email/blob lane → the delivery is our own archive echo.
- The nightly purge NULLs `storage_path` hours later; the echo lands seconds after upload — no
  timing interaction.

## Latent TKT-226 mislabel (fixed as a side effect)

Old rule: `merged > 0 and persisted == 0` → archive_mirror. A genuine external duplicate
re-upload of bytes that exist on the case as a DIFFERENT Box file (twin without blob
provenance) hit `merged > 0` and wrongly claimed `archive_mirror`. With `mirrored` present,
that shape is `mirrored = 0` → `external_upload`.

## Rolling-deploy analysis

- New webhook + old API: `mirrored` absent → None → falls back to the legacy merged heuristic
  (byte-identical labels to today).
- Old webhook + new API: `mirrored` in the response is ignored (additive field).
- Audit onceKey: an old API ignores the unknown `after` keys and writes as before (no
  regression, just no dedup until the API deploys).
