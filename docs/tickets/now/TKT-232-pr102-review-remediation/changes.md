# TKT-232 — changes

Each change carries the review-comment id(s) it remediates (see
[evidence/triage-2026-07-17.md](./evidence/triage-2026-07-17.md) for verdict evidence).

## data-api

- `features/inbound/persistence.ts` (F7 3600586565, F4 3597888615)
  - `ON CONFLICT` case_id is now `COALESCE(inbound_email.case_id, EXCLUDED.case_id)` —
    first-link-wins in the SQL itself; the attention-clear CASE still keys on the
    null→non-null transition.
  - `RETURNING id, case_id`; `upsertInboundEmail` returns
    `{ inboundEmailId, linkedCaseId }` (both null on the swallowed-error path).
- `features/inbound/retro-routes.ts`
  - (F7/F4) `linkEnvelopeRow` true only when `linkedCaseId === caseId`; resolve-existing
    returns the SURVIVING link on a lost race and skips the `retro_case_linked` audit;
    link-related counts `linked`/`linkedIds` only on a won race; null upsert → skipped.
  - (F5 3599105116, F6 3600586563) `currentInboundCaseId` → `currentInboundLink(imid,
    sourceMailbox)` (mailbox-qualified + row existence); ambiguous-suggestion trigger probe
    mailbox-qualified via `body.trigger.sourceMailbox`.
  - (F3 3597888606) related-link passes the `case_update/retro_related` classification only
    when INSERTING; an existing row keeps its triage decision (classification undefined).
  - (F12 3597926399) route-side `RELATED_LINK_CAP = 25` applies to NEW links only;
    alreadyLinked rows never consume cap; response gains `skippedByCap` (+ log when > 0).
  - (F1 3597536135) both `applyParserFields` recovery contexts set
    `archiveIdentityAcknowledged: !adoptArchivePo`.
  - (F2 3598638058) dev-mode note reworded ("…noted — … minted by the normal allocator");
    `retro_case_created` audit `after` carries `discoveredArchivePo` (with `boxFolderId`);
    `caseRefValue` precedence deliberately unchanged.
  - NEVER-RE-POINT header comment updated: the upsert SQL now enforces it.
- `features/evidence/internal-persist-routes.ts` (F16 3598034162) — `internalInboundAttention`
  accepts optional `sourceMailbox`; when present the UPDATE adds `AND source_mailbox = $3`
  (normalized); the `unable_to_locate` `AND case_id IS NULL` guard kept.
- `features/providers/recovery.ts` (F1) — `archiveIdentityAcknowledged?: boolean`; the
  unverified-archive-folder guard yields only when the flag is not true; guard order kept so
  `mint_not_allowed` still protects the production retro path.
- `features/inbound/internal/service-support.ts` + `internal/parser-fields.ts` (F1) — the flag
  rides `ProviderRecoveryContext` into `completeProviderRecoveryUsing`.
- `shared/mapping/cases.ts` (F23 3600586567) — `evidence_class`/`origin` nested-CASE guarded:
  the `::jsonb` cast can no longer evaluate before `pg_input_is_valid` passes.

## orchestration

- `workflows/retro/retro-envelope.ts` (F8/F9/F10) — new pure `senderProviderAgrees`
  ('agreed' | 'same_domain' | 'mismatch' | 'unknown') + `RetroTriggerIdentity`;
  `buildMinimalAnchorEnvelope` now REQUIRES `receivedAt` (the `new Date()` fallback removed —
  it runs inside the orchestrator; F15 determinism).
- `workflows/retro/retro-activities.ts`
  - (F8 3597536143, F9 3598034168) `retroOutlookLocate` gates candidates per rung BEFORE
    ranking: weak keys (vrm/claimant) require positive agreement (trigger unknown →
    fail-closed, logged `weak_key_uncorroborated`); external_ref drops only on positive
    mismatch and surfaces `providerCorroboration`; case_po exempt. One lazy
    `providerMatchRecords()` + `matchSenderIdentity` load per invocation.
  - (F10 3598638062) `retroLinkRelated` weak-subject-only candidates must be own-mailbox or
    provider-agreed; skipped ones counted in `weakUncorroborated` and logged.
  - (F11 3597888611) related sweep passes `onTruncated` to `searchMessages`.
  - (F13 3600586564) per-candidate `getMessageIdentity` wrapped try/catch → continue.
  - (F12) activity-side pre-cap slice removed; all corroborated rows go to the route
    (route caps NEW links); `skippedByCap` surfaced in the result + orchestrator log.
  - (F16) `retroRecordFailure` forwards `sourceMailbox` to the attention route.
- `workflows/retro/retro-case.ts`
  - (F15 3597926402) plan input `box.found` derives from the folder being LOCATED;
    fetch-faulted folders plan `boxInstruction: 'minimal'` → combined (Outlook found) or Held
    minimal anchor; `createMinimalAnchor` synthesizes the folder-keyed anchor envelope with
    the trigger's `receivedAt` else `ctx.df.currentUtcDateTime`.
  - (F18 3600227936) refused-original and catch fallbacks call `createFromOutlook(true)` —
    the combined arm keeps `casePo` + `boxFolder` (verified: needs only
    `located.folder && located.discoveredPo`).
  - (F17 3599709151) `force` on a Completed instance restarts only failure-family outcomes
    (complement of {created, linked, already_exists_linked}); refusals return the prior
    outcome.
  - (F16) all four failure-stamp call sites forward the known mailbox.
  - (F8/F9/F10) checkpointed `triggerIdentity` threaded into both activities;
    `outlook_provider:<corroboration>` caseTypeSignal on external-ref picks.
- `workflows/retro/retro-related-ingest.ts` (F14 3600227945) — `extractImages` receives
  `input.caseVrm || (!contradicted ? mapped.parserVrm : '')` so a first related email's photos
  are constrained by the parsed, non-contradicted VRM when the case has none yet.
- `adapters/data-api.ts` — typings for `sourceMailbox` + `skippedByCap`.

## Guard hook

- `.claude/hooks/box-scope-lib.mjs` (F19 3597926393, F20 3599105110, F21 3599709145) — method
  regex separator `[=\s]+` → `[=\s]*` (attached `-XDELETE` caught; `-X GET`/`-XGET`/`-X=GET`
  still allowed); body-flag regex now `(-[dTF]|--data(?:-[a-z]+)?\b|--json\b|--upload-file\b|--form\b)`,
  case-sensitive (curl short flags are case-sensitive — keeps `-fsSL` read-only) and without
  the trailing `\b` on short flags so attached `-dDELETE`/`-Fx=y`/`-Tfile` are caught.
- NEW `.claude/hooks/box-scope-lib.test.mjs` — 21 node:test cases (all three holes + allowed
  regressions + `--dump-header` non-match).

## SPA + domain (Change 13 support — TKT-233 seam shared with this batch)

- `packages/domain/src/dto/index.ts` — `InboundFacet.caseId?` (case-scoped slice keeps retro
  anchors).
- `apps/web/src/data/rest-client.ts` / `data/hooks.ts` / `__fixtures__/fixture-source.ts` —
  thread `caseId` to `GET /api/inbound?caseId=`.
- `apps/web/src/shared/ui/LinkedEmailsPanel.tsx` — the case Emails tab uses the case-scoped
  slice, so reconstruction anchors stay visible on the case while hidden from triage.

## Deviations recorded

1. F12's fix moved the cap ROUTE-side (new-links-only) instead of feeding prior linked ids
   into the activity's exclusions — a fresh orchestration cannot know prior run ids, so the
   route (which can) owns advancement; simpler and exact.
2. F2: `case_ref` precedence kept (externalRef first) — the review's asked-for flip would
   evict the genuine external reference the system matches on; the honesty fix (note wording
   + queryable `discoveredArchivePo` audit field) delivers the reviewer's underlying need
   (reconciliation identifier).
3. `ProviderRecoveryContext` lives in `features/inbound/internal/service-support.ts` (not
   `features/cases/` as the plan sketch guessed).
