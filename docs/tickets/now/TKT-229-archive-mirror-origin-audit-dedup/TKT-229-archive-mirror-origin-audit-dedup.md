---
id: TKT-229
title: The "Archived" (archive_mirror) label never fires and Box redeliveries duplicate audits
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-226, TKT-133, TKT-095]
research-link: docs/tickets/now/TKT-229-archive-mirror-origin-audit-dedup/evidence/post-sweep-audit-2026-07-16.md
---

# The "Archived" (archive_mirror) label never fires and Box redeliveries duplicate audits

## Problem

Two defects found by the 2026-07-16 post-sweep three-agent audit of PR #102's branch (distilled
in [evidence/post-sweep-audit-2026-07-16.md](./evidence/post-sweep-audit-2026-07-16.md)):

**A — the TKT-226 `origin='archive_mirror'` label never fires on the live echo sequence.**
`boxArchiveEvidence` stamps `box_file_id` on the evidence row per upload
(`mirrorArchiveItems` → `stampArchivedEvidence`); the Box webhook arrives 3–6 s later and POSTs
the same file with its sha256. The persist route's twin lookup finds the row, `sameIdentity`
is true via `ex.box_file_id === boxFileId`, and that branch `continue`s **without** incrementing
`merged` → response `{persisted: 0, merged: 0}` → the webhook derives `origin='external_upload'`.
The queue chip and Action log therefore claim external material arrived when the "upload" was
the system's own archive echo — the exact dishonesty TKT-226 set out to remove.

**B — Box redeliveries re-audit.** `evidence_exists_for_box_file` (data_api_client.py) was an
always-False interface-compat shim, so the "only on a fresh Evidence write" audit comment in
`function_app.py` was false: every Box redelivery of the same FILE.UPLOADED re-emitted a
`box_upload_received` audit row.

Doctrine: keep TKT-226's **mark, don't suppress** — a mirror echo still gets exactly ONE audit,
with the honest origin.

Deploy-train note: this ticket rides PR #102's open deploy train together with TKT-227/228
(pre-existing production P1s unrelated to the retro work — on the train because the operator
wants remediation deployed, not because they are retro regressions) and TKT-230/231.

## Change

1. **data-api reports the blob-provenance twin** (`internal-persist-routes.ts`): a new additive
   `mirrored` counter increments in BOTH twin branches when `blobTwin && isBoxRow`, where
   `blobTwin = ex.storage_path != null`. Discriminator: a Box-lane external upload's own row has
   `storage_path NULL`, while a mirror echo's twin is the classifyPersist blob row with
   `storage_path` set — `storage_path IS NOT NULL` exactly means "the system already owned these
   bytes from the email/blob lane". `merged` semantics are unchanged. Timing: the nightly purge
   NULLs `storage_path`, but the echo arrives seconds after upload, hours before any purge.
2. **box-webhook sharpens the origin** (`function_app.py`, `data_api_client.py`):
   `EvidenceWriteResult` gains `mirrored: int | None` (None preserved when an older API omits
   it); `mirror_echo = mirrored > 0 if mirrored is not None else merged > 0` (the required
   rolling-deploy fallback); `origin = 'archive_mirror'` only when `persisted == 0 and
   mirror_echo`. This also fixes the latent TKT-226 mislabel: a genuine external duplicate
   re-upload (twin without blob provenance, `merged > 0`, `mirrored = 0`) no longer claims
   `archive_mirror` once the new field is present.
3. **Audit once-only per Box file**: the webhook adds `boxFileId` and
   `onceKey = box_upload_received:<boxFileId>` to `after_fields`; `internalAudit`
   (`internal-operations-routes.ts`) accepts an optional onceKey (top-level or inside the
   `after` object) and, when present with a `caseId`, skips the write if an audit for the same
   (case, action, onceKey) already exists (204 either way). `audit_event.after` is text, hence a
   `pg_input_is_valid(after,'jsonb')` guard; the scan is bounded by `ix_audit_event_case_id`.
   Benign race documented: two concurrent deliveries can both pass the check — worst case one
   duplicate audit, never a lost one.
4. **Shim deleted**: `evidence_exists_for_box_file` and its call site are gone; the idempotent
   POST is the evidence-write dedup authority and the onceKey is the audit dedup authority.
   Status-evaluate still re-invokes on every delivery (deliberate).

## Acceptance

1. A Box FILE.UPLOADED whose sha256 twin carries blob provenance produces an audit with
   `origin='archive_mirror'`; the SPA chip/Action log reads "Archived".
2. Exactly ONE `box_upload_received` audit exists per Box file id across redeliveries.
3. A genuine external upload (fresh row, or a duplicate without blob provenance) still audits
   `origin='external_upload'`.
4. Rolling deploy is safe in both orders (additive response field; mirrored-None fallback).
5. Existing merged-semantics behaviour is unchanged (`merged` counts exactly what it did).

## Follow-ups (P4 — record only)

- The box facade's App Insights destination is undocumented (which workspace receives the
  box-webhook Function's traces) — documentation gap only, no code change.

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)
