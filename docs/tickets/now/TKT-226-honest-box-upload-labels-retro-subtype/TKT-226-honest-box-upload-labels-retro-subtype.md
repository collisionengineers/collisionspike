---
id: TKT-226
title: Box uploads mislabel the queue as "Images received"; retro_related subtype silently nulls
status: now
priority: P1
area: intake
tickets-it-relates-to: [TKT-117, TKT-133, TKT-124, TKT-134, TKT-095, TKT-222, TKT-225, TKT-034]
research-link: docs/tickets/now/TKT-226-honest-box-upload-labels-retro-subtype/evidence/incident-summary-2026-07-16.md
---

# Box uploads mislabel the queue as "Images received"; retro_related subtype silently nulls

## Problem

Two defects diagnosed from the FW26029 reconstruction of 2026-07-16 (chain and banked App
Insights excerpts in [evidence/incident-summary-2026-07-16.md](./evidence/incident-summary-2026-07-16.md)):

**A — dishonest Box-upload queue labels.** The box-webhook stamps a `box_upload_received` audit
for EVERY Box FILE.UPLOADED regardless of file type, and `last-activity.ts` hard-maps that action
to "Images received". FW26029's chip claimed images arrived when the "upload" was the system's own
archive mirror echoing back the case's `.eml` and body `.txt` (sha256 twins the evidence persist
route had already collapsed: `merged=1, persisted=0`). The webhook already computes the true
evidence class and the API already returns the mirror signal — both were being discarded at the
audit/label seams.

**B — `retro_related` subtype silently nulls.** The TKT-222 link-related lane stamps
`subtype: 'retro_related'`, but the name had no `choice_inbound_subtype` row and no
`INBOUND_SUBTYPE_TO_INT` entry: `upsertInboundEmail` silently mapped it to NULL and linked rows
rendered "Unidentified". The unmapped-name null was invisible (no log, no metric).

## Change

**Fix A (mark, don't suppress — the webhook receipt is a real external event):**

- box-webhook: `create_evidence` also returns `{persisted, merged}` from the persist response;
  `write_audit` gains keyword-only `after_fields`; `_process_upload` sends
  `after: {detail, filename, evidenceClass, origin}` where `origin='archive_mirror'` when the
  persist reported a merged sha256 twin and no fresh row (`external_upload` otherwise). Audit
  `name` format unchanged (it is the legacy read-time fallback key).
- data-api: new pure `boxUploadLabel` helper in `last-activity.ts` — mirror → 'Archived';
  image-class → 'Images received'; everything else and unparsable legacy → 'File added to
  archive'; legacy rows self-heal by parsing the filename from the audit name and classifying via
  `@cs/domain` `describeEvidence` (the one shared extension table). `CASE_SELECT_WITH_ACTIVITY`
  surfaces `summary`/`evidenceClass`/`origin` from the newest audit row (jsonb-guarded);
  `rowToCase` and `rowToActivityEvent` (Action-logs page) both route through `boxUploadLabel` so
  queue chip and Action log tell the same truth. Deploy-order safe both ways (additive payload;
  string-scalar legacy `after` handled).

**Fix B (real subtype, loud guard, pair refresh):**

- DDL delta `database/migrations/2026-07-17-tkt226-retro-related-subtype.sql`: append-only choice
  row `(100000016, 'retro_related', 'Related (retro-linked)')` + corrective backfill of the
  silently-nulled retro-linked rows. Baseline seed mirrored in `000_enums_lookups.sql`.
- Domain union/`INBOUND_SUBTYPES`/code-table JSON (`classifierEmits: false` — diminution
  precedent), `suggestedOutlookFolder` → 'Inbox/Case updates', data-api mapping both directions,
  `CATEGORY_FOR_SUBTYPE.retro_related = 'case_update'`, SPA label 'Related (retro-linked)',
  orchestration `SUBTYPE_DEFINITIONS` line (system-stamped, never classifier-chosen).
- `persistence.ts`: exported pure `categoryCodeFor`/`subtypeCodeFor` helpers that log a
  structured `inboundTaxonomyUnmapped` `console.error` marker (KQL-alertable) for a non-empty
  unmapped name instead of silently nulling — never throw (intake must not block). Subtype now
  refreshes together with category on a non-human re-upsert carrying a classification (a mapped
  category with NULL subtype means "unmapped subtype name" — persisting a mismatched stale pair is
  worse than the honest `(case_update, NULL)`).

## Acceptance

1. FW26029's queue chip no longer reads "Images received" after data-api redeploy, with **no
   manual reclassification and no audit-row mutation** (read-time derivation from stored
   name/payload) — Chrome screenshot in verification.md.
2. A non-image Box upload to any case's folder never yields an "Images received" chip; an
   image-class upload still does; a system mirror echo renders "Archived" (unit-proven via the
   label table; live-proven on the next retro run's `after.origin='archive_mirror'` audit rows).
3. `box_upload_received` audits carry `{filename, evidenceClass, origin}` in `after`; legacy rows
   without it derive labels from the summary filename; unknown/unparsable falls back to "File
   added to archive", never "Images received".
4. `retro_related` exists in the choice table (100000016), both mapping directions, domain union,
   SPA label 'Related (retro-linked)'; retro-linked rows persist subtype 100000016 (fresh writes
   AND the migration-backfilled FW-era rows); an unmapped subtype name now logs the
   `inboundTaxonomyUnmapped` marker instead of silently nulling.
5. Category/subtype refresh as a pair on non-human re-upserts (pinned by test).
6. All listed tests green; `node scripts/maintenance/ticket-generate.mjs`,
   `node scripts/checks/check-tickets.mjs`, `node scripts/checks/check-doc-links.mjs`,
   `node scripts/checks/check-runtime-contract.mjs` pass.

## Follow-ups (documented, NOT implemented here)

- **Vendored classifier signature/banner-image precision gap** — `email_classifier.py`'s
  `_delivered_images_only` kinds-only fallback vs `triagePolicy.ts` (169-172), `_SIGNATURE_IMAGE_RE`
  narrowness, image-sniff floors. Sibling-authoring-repo-first per ADR-0018. Banked live evidence
  shows it did NOT fire for FW26029 — separate precision work, not this incident's cause.
- **CC-vs-TO recipient awareness** — the pipeline is recipient-blind by design today; any change is
  its own ticket.
- **Webhook redelivery audit re-emit** — `function_app.py` (~812) comments "only on a fresh
  Evidence write" but the audit is written unconditionally per delivery (pre-existing
  comment/behaviour mismatch; now at least carries honest fields). Candidate micro-ticket.

## Research

Distilled 2026-07-16/17 from the live FW26029 chain; App Insights excerpts and the KQL that
produced them are banked under [evidence/](./evidence/) (the source is perishable free-tier
telemetry). See [incident-summary-2026-07-16.md](./evidence/incident-summary-2026-07-16.md).

## Artifacts

- [Changes made](./changes.md)
