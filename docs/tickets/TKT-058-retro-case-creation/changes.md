# TKT-058 — changes log

## 2026-07-04 — R2 built (Box archive reconstruction — the primary source; ships dark)

- **Box client** (`functions/box-webhook/box_client.py`): dual RW/RO scope model —
  `BOX_READONLY_ROOT_IDS` config, **split verification caches** (`_SCOPE_VERIFIED` RW-only /
  `_SCOPE_VERIFIED_RO` — a single cache would let an RO-verified id pass a later WRITE
  assertion), `_assert_readable_scope` (reads may target RW + RO roots; writes unchanged,
  RW-only), `search_content` (`/2.0/search` under configured roots, ancestor post-filter —
  `ancestor_folder_ids` treated as advisory), `resolve_case_folder` (hit → the ancestor
  directly under the root), `download_file` (302→boxcloud host-pin, 25 MiB cap
  `BOX_DOWNLOAD_MAX_BYTES`, metadata pre-probe refuses before bytes move), `list_folder`
  fields widened (`type,size`). Routes: `POST box/search` (rootIds validated server-side),
  `GET box/files/{id}/content`. pytest: RO/RW matrix incl. the cache-split regression +
  search post-filter + download cap/host pins (135 total green).
- **Parser wrapper** (`functions/parser/function_app.py` — repo-local, vendored engine
  untouched per ADR-0018): `POST /explode-eml` (stdlib `email`; text/plain-preferred body,
  HTML-stripped fallback; nested `message/rfc822` re-emitted as `.eml`; signature-raster
  byte-floor skip (TKT-047); per-attachment + total caps; typed 400/422). 6 new pytest.
  NOTE: the 2 pre-existing multiformat `.doc` failures on this dev box are environmental
  (no Word COM/LibreOffice/antiword) — documented in-repo as "the two known pre-existing
  multiformat field-extraction failures"; parser venv removed after the run so verify-all
  keeps its SKIP posture here.
- **Orchestration**: `lib/retro-envelope.ts` (+22-case tests) — live-parity envelope
  builders (shared `hashPayload`, exported from fetchMessage.ts; synthetic
  `retro:box:<fileId>` ids; eml/doc/minimal-anchor forms), `pickCaseFolder` (ref-tier
  outranks VRM; unanimity else refuse), `classifyArchiveFile`; facade additions
  (`box.searchContent`/`downloadFile`, widened `listFolderItems`, `callExplodeEml`);
  `gated/retro-case.ts` full R2 chain — `retroBoxLocate` (key ladder, PO-shape +
  principal validation, VRM-only requires sender-provider agreement),
  `retroBoxFetchInstruction` (eml→doc→minimal degradation, blob landing),
  `retroCreatePersist` (create + byte-less archive-evidence registration,
  acceptedForEva=false), then EXISTING parse/classifyPersist/statusEvaluate; corroboration
  demotion (parsed ref+VRM both disagreeing with the trigger keys → Held anchor);
  archive marker beats content case-type; NO enrich / NO folder-create / NO
  boxArchiveEvidence (RO archive). `providerPrincipal` threaded from providerMatch
  through the intake hooks. `dataApi.registerBoxEvidence` (existing evidence route,
  box_file_id dedup).
- **Verification**: tsc all-projects green; orchestration vitest 132 (incl. the new
  envelope suite); box-webhook pytest 135; api 153; domain 887. Gates still dark.

## 2026-07-04 — R1 built (foundations + any-status link)

- **Domain** (`packages/domain`): new `src/domain/retro-case.ts` (+44-case test file) —
  `RETRO_TRIGGER_CATEGORIES`, `CASE_PO_SHAPE_RE` (anchored mirror of the classifier
  `CASEREF_RE`), `normalizeCasePo`, `decideRetro`, `decideRetroStatus`, `parseCasePoMarker`,
  `matchPrincipalByCasePo`, `markerToCaseType`, `selectBoxInstructionCandidate`; barrel export;
  `gates.ts` + `retroCase` / `retroOutlookSearch` / `retroBoxArchiveRootIds`.
- **Schema**: `migration/assets/schema/deltas/2026-07-04-retro-case.sql` (idempotent, additive
  — `choice_audit_action` 100000046-48, `choice_intake_channel_kind` 100000003 `retro`) +
  the same rows appended to canonical `000_enums_lookups.sql`. NOT yet applied live.
- **Data API** (`api`): `AUDIT_ACTION` + retro codes; exported the shared internals
  (`withServiceAuth`, `upsertInboundEmail`, `applyParserFields`, `isUniqueViolation`, envelope
  types) from `functions/internal.ts` (no behaviour change); new `lib/retro-validate.ts`
  (+tests) and `functions/internal-retro.ts` — `POST /api/internal/retro/resolve-existing`
  (any-status link, never-re-point guard, ambiguity flag) + `POST /api/internal/retro/create`
  (get-or-create under triage locks, verbatim discovered PO, terminal-only-when-verified,
  conflict→link); registered in `src/index.ts`.
- **Orchestration**: `lib/data-api.ts` + `retroResolveExisting`/`retroCreate`; new
  `functions/gated/retro-case.ts` — `retroCaseOrchestrator` (ladder scaffold: rung 1 live,
  R2/R3 rungs stubbed), activities `retroFindTrigger`/`retroResolveExisting`/
  `retroRecordFailure`, keyed drain starter `POST /api/retro-case` (deterministic
  `retro-<id>` instance dedup); registered in `src/index.ts`; two additive `decideRetro` +
  `callSubOrchestratorWithRetry` hooks in `intakeOrchestrator.ts` (reply lane after
  `linkReply` non-linked; non-reply lane before its return).
- **Verification**: domain 442→full-workspace 886 vitest green; api tsc + 153 tests green;
  orch tsc green; esbuild bundles rebuilt (`deploy/api/main.cjs`, `deploy/orch/main.cjs`).
  Gates unset everywhere → live behaviour unchanged (ships dark).
