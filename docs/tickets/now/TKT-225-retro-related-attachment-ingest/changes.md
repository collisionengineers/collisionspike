# Changes — TKT-225: Parse retro-linked related correspondence into the case

## Status
now — implemented 2026-07-17 (same branch as TKT-219/TKT-222, PR #102); offline-tested; ships DARK
(`RETRO_RELATED_INGEST_ENABLED` unset = TKT-222 v1 behaviour, byte-identical).

## What changed

- `packages/domain/src/gates.ts` — new `retroRelatedIngest` gate (`RETRO_RELATED_INGEST_ENABLED`,
  default off; orchestration app only — the Data-API route rides `RETRO_CASE_ENABLED`).
- `retro-envelope.ts` — new pure `relatedParseContradictsKeys` (the ref-AND-VRM-both-disagree
  demotion rule, extracted); `prepareOutlookOriginal` now calls it (behaviour-preserving).
- `retro-activities.ts` — `retroLinkRelated` retains the (mailbox, Graph-id, receivedAt) mapping
  behind each posted row and, gate-on ONLY, returns `ingestRows` (receivedAt ASC,
  `RELATED_INGEST_CAP=25`, truncation warned) merged from the route's `linkedIds` +
  `alreadyLinkedIds`; new `retroBackfillFields` activity (both gates re-checked inside). Also
  repaired a raw NUL byte a previous session materialized in the retroLinkRelated dedup key
  (now the proper `\u0000` escape — identical runtime value, file is clean text again).
- NEW `retro-related-ingest.ts` — `retroRelatedIngestOrchestrator` child: per row sequential with
  per-row salvage, `fetchMessage` → `parse` (best-effort) → `classifyPersist`
  (`bodyInstructionFallback:false`) → `extractImages` (best-effort) → `retroBackfillFields` (only
  when uncontradicted and the parse yielded anything); one `statusEvaluate`; returns
  `{ processed, failed, fieldsApplied }`. Registered from `index.ts`.
- `retro-case.ts` `finishPersisted` — branches on the checkpointed `ingestRows` to schedule the
  child; D8: re-runs `boxArchiveEvidence` once when this arm archived into the freshly ensured
  writable folder (Outlook-only arm); everything inside the existing TKT-222 best-effort try.
- `classifyPersist.ts` — `ClassifyPersistInput.bodyInstructionFallback?: boolean` (default true =
  unchanged for all existing callers); `false` suppresses the ≥40-char body-instruction row.
- `adapters/data-api.ts` — `retroLinkRelated` return widened (`linkedIds`/`alreadyLinkedIds`);
  new `retroBackfillFields`.
- Data API `retro-routes.ts` — link-related response gains `linkedIds` + `alreadyLinkedIds`
  (additive; `existing === caseId` rows are ingest-eligible, other-case rows in neither list);
  new `POST /api/internal/retro/backfill-fields` (`withServiceAuth`, honest `gated_off` while
  `RETRO_CASE_ENABLED` off): VRM fill-if-empty under the triage lock (TKT-073 junk guard,
  provenance + audit) then `applyParserFieldsUsing` with NO provider / NO intermediary / NO
  recoveryContext (D7 — fill-gaps only, no mint, no recovery); before/after snapshot decides
  `applied` vs `noop`; one summary audit only when applied. Validator
  `validateRetroBackfillFields` in `retro-validate.ts`.
- `docs/adr/0022-retroactive-case-reconstruction.md` — related-correspondence ingest amendment
  paragraph (2026-07-16 directive).

## Post-review fixes (2026-07-17, docs/Azure review lane)

- `retro-activities.ts` — ingest-eligible ids deduped via `Set` (a cross-mailbox twin — the same
  Internet-Message-Id landing in two intake mailboxes — could appear once in `linkedIds` and once
  in `alreadyLinkedIds`, double-consuming cap slots and double-fetching one message), and the
  `byInternetMessageId` key is now trimmed to match the route's trimmed `linkedIds` (an id with
  stray whitespace would otherwise silently fall out of `ingestRows`).
- `retro-case.ts` — the best-effort backfill catch now names the failed stage
  (`retroLinkRelated` vs `retroRelatedIngestOrchestrator`) instead of blaming every failure on
  `retroLinkRelated`.
- Review follow-up candidates (not in this ticket): `Retry-After`-aware retry in `graphFetch`
  (pre-existing gap, first made observable by the ~25× call volume; gate ships dark so volumes
  stay tiny), filtering `classifierEmits:false` subtypes out of the AOAI enum.

## Tests

- `retro-case-provider-recovery.test.ts` — parent schedules the child on `ingestRows` + D8
  re-mirror (gate-on); the no-`ingestRows` runs pin the dark path (no child call).
- NEW `retro-related-ingest.test.ts` — happy path (flag + chain order + one statusEvaluate),
  per-row salvage (thrown fetch, second row fully processed), contradiction (fields skipped,
  evidence persists), empty parse (backfill skipped).
- `retro-envelope.test.ts` — `relatedParseContradictsKeys` truth table (single disagreement ≠
  contradiction; absent keys/parses never contradict; sniff fallback; normalisation).
- `classifyPersist.test.ts` — activity-harness cases: default/true unchanged, `false` suppresses
  the body-instruction row.
- `retro-routes.test.ts` — link-related `linkedIds`/`alreadyLinkedIds`/never-re-point pinned;
  backfill-fields: `gated_off`, 400 without source id, D7 delegation shape + `noop`, VRM
  fill-if-empty (normalised, locked, provenance naming the source email), never-overwrite,
  junk-VRM drop.

## Gates run
domain build ✓ · orchestration build ✓ test 522 ✓ · data-api build ✓ test 1007 ✓ ·
check:tickets ✓ · check:docs ✓.
