# TKT-058 — changes log

## 2026-07-04 — R4 built (provenance display + docs closure)

- `packages/domain`: `IntakeChannelKind` widened to `email|whatsapp|provider_api|retro`
  (+ the shared `INTAKE_CHANNEL_LABELS` map); `intakeChannelKindCodec` union widened;
  `intake-channel.json` +2 options (parity with the canonical DDL — also fixes the
  pre-existing lag where a provider_api case decoded to the 'email' fallback).
- `services/data-api/src/shared/mapping/`: fallback-semantics note (the 'email' default now only masks a
  genuinely-NULL channel code).
- SPA: CasePeekDrawer / CaseDetail / CaseList channel chips moved off the hardcoded
  `whatsapp ? 'WhatsApp' : 'Email'` ternaries onto `INTAKE_CHANNEL_LABELS` (a retro or
  provider-API case now reads honestly).
- `CONTEXT.md`: glossary — Retro case / Retroactive reconstruction, Archive root
  (read-only), Reconstruction ladder.
- LIVE_FACTS/live-environment untouched on purpose: everything ships dark; the gates +
  applied-delta get registered there at the D11 deploy.

## 2026-07-04 — R3 built (Outlook `$search` fallback rung; ships dark)

- `services/orchestration/src/adapters/graph.ts`: `kqlPhrase` + `searchMessages` — Graph messages
  `$search` per Microsoft Learn (verified this session, pinned in the function header):
  from/subject/body default targeting, sent-date ordering (client re-ranks), double-quoted
  clause, NO `$filter`/`$orderby` combining on messages (silent-failure risk), no
  ConsistencyLevel header (directory-only), whole-mailbox surface incl. Sent Items; rides
  the existing Exchange-RBAC `Mail.Read` scope — no new grant.
- `lib/retro-envelope.ts`: `selectOutlookOriginal` (drop own-mailbox senders, prefer
  attachments, prefer non-RE:/FW:, earliest wins, deterministic tiebreak) + tests.
- `gated/retro-case.ts`: `retroOutlookLocate` activity (gated `RETRO_CASE_ENABLED` +
  `RETRO_OUTLOOK_SEARCH_ENABLED`; per-mailbox fan-out over `intakeMailboxes()`, key ladder
  externalRef → casePo → vrm, one mailbox failing never sinks the rung); orchestrator rung
  3 wiring — fires only when the archive had NO folder; corroboration REQUIRED (trigger key
  literally in the found message's subject/body, or parsed reference/VRM agreement) else
  NOTHING is created (no anchor without an archive folder); corroborated → EXISTING
  fetchMessage → parse → create Held with NO Case/PO (`casePoKnown=false`; the PO namespace
  stays untouched, `case_ref` = the external ref); shared `mapRetroParse` helper extracted
  (Box rung refactored onto it).
- **Verification**: tsc green; orchestration vitest 136 (kqlPhrase + selectOutlookOriginal
  suites added). Gates still dark.

## 2026-07-04 — R2 built (Box archive reconstruction — the primary source; ships dark)

- **Box client** (`services/functions/box-webhook/box_client.py`): dual RW/RO scope model —
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
- **Parser wrapper** (`services/functions/parser/function_app.py` — repo-local, vendored engine
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
- **Schema**: `database/migrations/2026-07-04-retro-case.sql` (idempotent, additive
  — `choice_audit_action` 100000046-48, `choice_intake_channel_kind` 100000003 `retro`) +
  the same rows appended to canonical `000_enums_lookups.sql`. NOT yet applied live.
- **Data API** (`api`): `AUDIT_ACTION` + retro codes; exported the shared internals
  (`withServiceAuth`, `upsertInboundEmail`, `applyParserFields`, `isUniqueViolation`, envelope
  types) from `services/data-api/src/features/` (no behaviour change); new
  `services/data-api/src/features/inbound/retro-validate.ts` (+tests) and
  `services/data-api/src/features/inbound/retro-routes.ts` — `POST /api/internal/retro/resolve-existing`
  (any-status link, never-re-point guard, ambiguity flag) + `POST /api/internal/retro/create`
  (get-or-create under triage locks, verbatim discovered PO, terminal-only-when-verified,
  conflict→link); registered in `src/index.ts`.
- **Orchestration**: `lib/data-api.ts` + `retroResolveExisting`/`retroCreate`; new
  `services/orchestration/src/workflows/retro/retro-case.ts` — `retroCaseOrchestrator` (ladder scaffold: rung 1 live,
  R2/R3 rungs stubbed), activities `retroFindTrigger`/`retroResolveExisting`/
  `retroRecordFailure`, keyed drain starter `POST /api/retro-case` (deterministic
  `retro-<id>` instance dedup); registered in `src/index.ts`; two additive `decideRetro` +
  `callSubOrchestratorWithRetry` hooks in `intakeOrchestrator.ts` (reply lane after
  `linkReply` non-linked; non-reply lane before its return).
- **Verification**: domain 442→full-workspace 886 vitest green; api tsc + 153 tests green;
  orch tsc green; esbuild bundles rebuilt (`.artifacts/deploy/data-api/main.cjs`, `.artifacts/deploy/orchestration/main.cjs`).
  Gates unset everywhere → live behaviour unchanged (ships dark).

## 2026-07-09 — PLAN-003 intake wave (reopened on the PHA5007 operator report; fixes shared with TKT-119)

- **Ack eligibility:** `decideRetro` accepts `non_actionable`/`acknowledgement` triggers
  (`RETRO_TRIGGER_ACK_SUBTYPE`) — locate-and-link/reconstruct only; the ack itself never mints.
  Subtype threaded through both intake hooks + the manual drain.
- **Silent-refusal fix:** `decideRetro` `attempt:false` is now logged (`retroDecision` events) in
  both intake lanes; ladder failures stamp the trigger row `unable_to_locate`
  (retroRecordFailure → the new `/api/internal/inbound/attention`), rendered in the SPA.
- **Create-seam guard:** `retro/create` refuses an ack/digest-family "original"
  (`refused_category`), and the orchestrator falls through to the failure record instead of ending
  silently (both rungs).
- **TKT-073 clamp on this path:** the retro VRM chain + caseRefValue are guarded (the 2026-07-07
  retro-create 500s that lost SAB/46329/1 + DIK/JMO/46440/1 were `case_.vrm` 22001 overflows).
- **First real drain uses:** `POST /api/retro-case` ran twice live — PHA5007 → Held case
  `87e79f62…` (Outlook rung; original recovered from engineers@ Deleted Items) and 46671/1 → case
  `6cd60114…` (the TKT-101 split). The drain lever is now field-proven.
- **Deleted-Items answer (TKT-119d memo):** the R3 whole-mailbox `$search` already reaches Deleted
  Items — no new rung needed; volumes + hit-rates measured read-only (memo in TKT-119 evidence/).
- Deployed 2026-07-09: orch 70 fns / api 89 fns (registry 2026-07-09T04:45Z).
