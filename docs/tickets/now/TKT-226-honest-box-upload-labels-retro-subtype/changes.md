# Changes — TKT-226: Box uploads mislabel the queue as "Images received"; retro_related subtype silently nulls

## Status
now — implementation complete and offline-tested on branch `feat/tkt-219-retro-parallel-reconstruction`
(PR #102); NOT deployed, migration NOT applied (separately authorized operator steps — see the
spec's acceptance lines and the deploy notes below).

## Commits
- (uncommitted at authoring time — work sits in the PR #102 working tree alongside TKT-225's
  completed uncommitted changes; committing is the dispatching session's step)

## Files touched

Fix A — honest Box-upload labels:
- `services/functions/box-webhook/data_api_client.py` — `EvidenceWriteResult {tag, persisted, merged, updated}`
  returned by `create_evidence` (tag keeps legacy truthy semantics); `write_audit` gains keyword-only
  `after_fields` (object `after` payload; no-kwarg call byte-identical).
- `services/functions/box-webhook/function_app.py` — `_process_upload` hoists the true
  `evidence_class`, derives `origin` (`archive_mirror` when `merged>0 && persisted==0`, else
  `external_upload`), audits with `after_fields={filename, evidenceClass, origin}`; audit `name`
  format unchanged (legacy fallback key). Audit-emission timing NOT changed (scope discipline).
- `services/data-api/src/shared/mapping/cases.ts` — `CASE_SELECT_WITH_ACTIVITY` lateral surfaces
  `last_activity_summary` / `last_activity_evidence_class` / `last_activity_origin` (audit branch:
  `ae.name` + object-guarded `ae.after::jsonb->>…`; note/chaser branches: `NULL::text`);
  `rowToCase` passes the three fields into `lastActivityLabel`.
- `services/data-api/src/shared/last-activity.ts` — new exported pure `boxUploadLabel` (decision
  table: archive_mirror → 'Archived'; image → 'Images received'; else/unparsable → 'File added to
  archive'; legacy summary-filename self-heal via `@cs/domain` `describeEvidence`);
  `AUDIT_ACTION_LABELS.box_upload_received` → 'File added to archive'; `lastActivityLabel` routes
  box_upload_received audit rows through `boxUploadLabel`.
- `services/data-api/src/shared/mapping/evidence.ts` — `rowToActivityEvent` derives the
  box-upload description via `boxUploadLabel` (object `after` parsed guardedly; serving queries
  are `SELECT *` so `after` is present) — the Action-logs page tells the same truth as the queue.

Post-review (2026-07-17, docs/Azure review lane — verdict SHIP, no code defects):
- `function_app.py` origin-derivation comment corrected: an image-class mirror echo whose sha256
  pre-fetch fails (over-cap) DOES fall back to "Images received" — honest about the file, wrong
  about its origin; accepted edge case, comment no longer overclaims.
- Documented follow-up candidates (not this ticket): `origin=archive_mirror` conflates a true
  system echo with an external re-upload of byte-identical content (both render 'Archived');
  `evidence_kind.py` extension table is a hand-duplicated twin of `@cs/domain` EXTENSION_TABLE
  (in sync today — a one-sided extension would split chip truth); pair-refresh guard is
  asymmetric for the unmapped-CATEGORY + mapped-subtype skew direction (loud guard logs it).
- Review re-confirmed: DDL-before-build ordering is MANDATORY — deploying a build that maps
  100000016 before the migration hits the FK on `inbound_email.subtype_code` and
  `upsertInboundEmail`'s catch silently drops the whole triage row (worse than the NULL symptom,
  and the loud guard does not fire since the NAME mapped fine). Keep the migration first in the
  deploy runbook.

Fix B — real `retro_related` subtype:
- `database/migrations/2026-07-17-tkt226-retro-related-subtype.sql` — NEW: choice row 100000016 +
  corrective backfill of silently-nulled retro-linked rows (transactional, `ON CONFLICT DO NOTHING`).
- `database/baseline/000_enums_lookups.sql` — seed mirror appended (append-only comment referencing
  the delta). `900_constraints.sql` untouched (stays main-based).
- `packages/domain/src/dto/index.ts` — `'retro_related'` appended to the `InboundSubtype` union +
  `INBOUND_SUBTYPES` (last, code-table order) with a system-stamped doc line.
- `packages/domain/src/data/code-tables/inbound-email-classification.json` — option 100000016,
  label 'Related (retro-linked)', `classifierEmits: false` (diminution precedent).
- `packages/domain/src/domain/outlook-folder.ts` — `retro_related` files with the `update_general`
  arm → 'Inbox/Case updates'.
- `services/data-api/src/shared/mapping/inbound.ts` — both maps: `100000016 ↔ retro_related`.
- `services/data-api/src/features/inbound/routes.ts` — `CATEGORY_FOR_SUBTYPE.retro_related = 'case_update'`.
- `apps/web/src/features/inbox/inbox-email-type.ts` — `SUBTYPE_LABEL.retro_related = 'Related
  (retro-linked)'`; appended to `SUBTYPES_BY_CATEGORY.case_update`.
- `services/orchestration/src/adapters/aoai.ts` — `SUBTYPE_DEFINITIONS.retro_related` (assigned by
  the system, never chosen by the model; enum inherits from `INBOUND_SUBTYPES` automatically).
- `services/data-api/src/features/inbound/persistence.ts` — exported pure `categoryCodeFor` /
  `subtypeCodeFor` with the loud `inboundTaxonomyUnmapped` `console.error` marker (never throws;
  runs before the try); exported `INBOUND_SUBTYPE_PAIR_REFRESH_SQL` — subtype refreshes together
  with category on non-human re-upserts carrying a classification (`human` still freezes both).

Tests:
- `services/data-api/src/shared/last-activity.test.ts` — `auditActionLabel(100000021)` pin updated;
  new `boxUploadLabel` decision-table suite + `lastActivityLabel` box-upload branch cases.
- `services/data-api/src/shared/mapping/index.test.ts` — query-shape pins for the TKT-226 lateral
  fields; `rowToCase` honest-chip cases (mirror/image/legacy); `rowToActivityEvent` box-upload
  cases (object payload → 'Archived'; legacy `.jpg` → 'Images received'; legacy `.eml` → 'File
  added to archive'; extensionless legacy summary → 'File added to archive').
- `services/data-api/src/features/inbound/persistence.test.ts` — NEW: loud-guard behaviour
  (mapped/unmapped/empty/never-throws, marker JSON shape) + pair-refresh SQL pins.
- `packages/domain/src/codecs/index.test.ts` — `retro_related ↔ 100000016` pin (round-trip/parity
  suites auto-extend).
- `packages/domain/src/domain/outlook-folder.test.ts` — explicit 'Inbox/Case updates' pin.
- `apps/web/src/features/inbox/inbox-email-type.test.ts` — SUBTYPE_LABEL + category-membership pin.
- `services/functions/box-webhook/tests/test_data_api_client.py` — result-object assertions,
  merged-twin + fresh-write counter tests, `after_fields` object-shape test (legacy string-after
  test kept as-is: back-compat pin).
- `services/functions/box-webhook/tests/test_webhook.py` — fake client returns
  `EvidenceWriteResult` (scriptable); three new receiver tests: external image upload audits
  `{filename, evidenceClass:image, origin:external_upload}`; merged `.eml` twin audits
  `origin:archive_mirror` (and `evidenceId` stays ''); fresh PDF audits `evidenceClass:instruction`.

Generated/parity artifacts:
- `contracts/runtime-contract.snapshot.json` — regenerated via the documented generator
  (`check-runtime-contract.mjs --write`): folds in this ticket's `InboundSubtype` union change AND
  the branch's pre-existing TKT-222/225 retro routes (`internalRetroLinkRelated`,
  `internalRetroBackfillFields`) which had not been snapshotted (189 → 191 routes; the check was
  already failing on the working tree before TKT-226 touched anything).
- `database/tests/code-table-parity.mjs` — `EXPECTED_MAPPING_SHA256` pin advanced for the
  append-only subtype (the file's own documented update pattern; every per-table assertion still
  proves the numeric mapping).

Evidence:
- `docs/tickets/now/TKT-226-honest-box-upload-labels-retro-subtype/evidence/` — banked same-day
  App Insights excerpts (5 JSON) + the KQL that produced them (6 files) +
  `incident-summary-2026-07-16.md` (the research-link narrative).

## Summary

Root causes: (A) the box-webhook stamped `box_upload_received` for every FILE.UPLOADED and
last-activity.ts hard-mapped that action to "Images received" — the FW26029 chip claimed images
when the system's own archive mirror echoed back an `.eml` + `.txt`; (B) `'retro_related'` was
stamped by the TKT-222 lane with no code-table/mapping backing, so it nulled silently to
'Unidentified'. Fix A marks (never suppresses) the audit with `{filename, evidenceClass, origin}` —
origin derived from the persist route's own `merged` sha256-twin signal — and derives the label
read-time (`boxUploadLabel`), healing every legacy row including FW26029 with zero data mutation;
deploy order webhook/data-api is safe either way (additive payload; legacy string `after` handled).
Fix B mints code 100000016 end-to-end (DDL delta + baseline mirror + domain union + both mapping
directions + SPA label + folder + LLM prompt line), makes the unmapped-name case loud
(`inboundTaxonomyUnmapped` marker), backfills the silently-nulled rows, and refreshes
category+subtype as a pair on non-human re-upserts.

TKT-225 interaction (same branch, uncommitted): TKT-225's ingest re-runs `upsertInboundEmail` for
already-linked rows — after the pair-refresh those non-human re-upserts will (correctly) restamp
`(case_update, retro_related)`. TKT-226 touches none of TKT-225's files except additive edits to
`persistence.ts` (which carried no TKT-225 working-tree changes at edit time).

## Deploy notes (separately authorized; NOT performed here)

1. Apply `database/migrations/2026-07-17-tkt226-retro-related-subtype.sql` FIRST (choice row must
   exist before any build writes code 100000016 — TKT-170 ordering rule).
2. Deploy `cespk-api-dev` (data-api) — this alone heals the FW26029 chip read-time.
3. Deploy `cespkbox-fn-v76a47` (box-webhook) — order with (2) safe either way.
4. Live checks per spec acceptance: SPA queue chip + Action log screenshots; KQL
   `traces | where message has "inboundTaxonomyUnmapped"` (expect 0); a fresh
   `box_upload_received` row's `after` carries `origin`/`evidenceClass`; DB read shows retro-linked
   rows at subtype 100000016.
