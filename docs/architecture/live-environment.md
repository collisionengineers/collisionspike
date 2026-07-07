# Live environment reference — collisionspike (Azure PaaS)

> **Canonical registry of what is actually deployed.** This file + [`LIVE_FACTS.json`](../../LIVE_FACTS.json)
> (root) are the **single source for literal live numbers** — every other doc links here rather than
> re-embedding a count. Last live change: **2026-07-04T18:40Z** — the **Case/PO cutover tooling**
> (same-session follow-on; the operator surfaced that the OLD process mints the number **at EVA-add,
> by a staff member** — pre-EVA cases have no Case/PO — while the new system mints at intake, which
> stays the go-live behaviour): the **`case_po_floor` delta is APPLIED LIVE** (0 rows = **dark**;
> public base tables **39→40**), the **api republished** (79 re-confirmed — `mintCasePo` + the
> `next-po` preview allocate `GREATEST(db max, floor)+1`; `PATCH /api/cases/{id}` accepts `casePo`,
> shape-validated, 409 `case_po_in_use` on conflict, audited), and the **SPA redeployed** (the
> case-page **Set-Case/PO editor** — staff stamp the REAL number at EVA-add during the trial; CSP
> re-verified). Trial + cutover procedure:
> [docs/plans/case-po-sequence-cutover.md](../plans/case-po-sequence-cutover.md); operator inputs:
> [gated.md D11](../gated.md). Prior change: **2026-07-04T17:55Z** — the **retro-reconstruction activation**
> (ADR-0022 / [TKT-058](../tickets/verify/TKT-058-retro-case-creation/TKT-058-retro-case-creation.md);
> user-instructed "apply this delta — deploy anything necessary"): the **`2026-07-04-retro-case` DDL
> delta is APPLIED LIVE** (audit actions 100000046–48 `retro_case_created`/`retro_case_linked`/
> `retro_reconstruction_failed` + `choice_intake_channel_kind` 100000003 `retro`; VERIFY selects
> confirmed; transient FW rule added+removed). **All four surfaces deployed at commit `d91c185`**:
> api **77→79** (+the two `/api/internal/retro/*` routes), orch **53→62** (+the keyed
> `POST /api/retro-case` drain starter, `retroCaseOrchestrator`, and 7 retro activities), box-webhook
> **10→12** (+`POST box/search` read-only content search, +`GET box/files/{fileId}/content` capped
> download; the RW/RO scope-cache split is live), parser **3→4** (+`explode_eml`). **Gate flipped:
> `RETRO_CASE_ENABLED=true` on BOTH apps** — **rung-1 ANY-STATUS linking is ACTING** (an unmatched
> billing/case-update/cancellation/query email with a reference/VRM key now links to its case,
> terminals included; ambiguity is flagged, never guessed; failed attempts are audited). The **Box
> rung stays DARK** (`RETRO_BOX_ARCHIVE_ROOT_IDS`/`BOX_READONLY_ROOT_IDS` unset — operator supplies the
> real archive root ids + the Box Viewer grant, **and the Case/PO sequence-alignment question must be
> settled first**; [gated.md D11](../gated.md)); the **Outlook rung stays DARK**
> (`RETRO_OUTLOOK_SEARCH_ENABLED` unset). Smoke: both new API/starter routes **401** fail-closed.
> Prior change: **2026-07-04T13:10Z** — the **audit case-type activation
> (user-instructed full go-live)**: the **D9 EVA-deactivation delta** was applied and proved a
> **verified no-op** (the pre-check *and* a broad `ILIKE '%eva%'` sweep found **zero** matching
> `work_provider` rows — the live corpus **never held an EVA row**; the "EVA (Engineers)" mislabels came
> solely from the parser layout-name fallback, killed in engine-v2.6); the **D10 case-type taxonomy
> delta** was applied (`choice_case_type` now **4 rows** — added `audit_total_loss` 100000002 +
> `diminution` 100000003; `choice_evidence_kind` 100000007 `engineer_report` confirmed). **All four
> surfaces were redeployed at commit `aafeba1`**: parser (**engine-v2.6** — engineer-report layout-name
> fallback suppression, the `case_type` envelope, `AP.`/`D.` marker refs; 3 functions re-verified), api
> (**77** re-verified — `isEngineerReportLayoutSentinel` denylist, marker-aware `mintCasePo`,
> `case_type_code` writes, `PATCH caseType`), orch (**53** re-verified — `MAX_PARSE_DOCS=3` multi-doc
> parse, extraction-first instruction selection, `engineer_report` evidence typing, replay-safe
> `decideCaseType`), SPA (carries the `16e152c` dashboard cockpit fix; CSP re-verified live). **Gate
> flipped: `AUDIT_CASES_ENABLED=true` on BOTH `cespk-api-dev` + `cespk-orch-dev`** (user-instructed; the
> D10 shadow-review step was explicitly waived by the user). Acting from now: detected audits write
> `case_type_code`; standalone PCH/QDOS audits mint from the marker's own sequence (`A.PCH26xxx`…); QDOS
> dual "report + audit report" letters keep the standard number with case-type `audit`; report-typed
> attachments persist as `engineer_report` evidence. Remaining: a live probe on the next real audit
> email ([TKT-056](../tickets/verify/TKT-056-audit-case-type-activation/TKT-056-audit-case-type-activation.md)
> step 6). Prior change **2026-07-03T16:20Z** — the **second wave (rules-engine-v2
> activation)**: the **D7 taxonomy delta**, the **Phase-4 `ai_suggestion.embedding` delta**, and the **D8
> identification delta** are **ALL APPLIED LIVE** (via Entra `digital@` → `SET ROLE csadmin`; verified:
> `choice_inbound_category` 100000005/06, `choice_inbound_subtype` 100000010–12,
> `inbound_email.body_jobref`/`conversation_id`, `ai_suggestion.embedding`, the Connexus `image_source`
> intermediary row + its PCH/SBL links, PCH `known_email_domains=pch-ltd.com`); the **parser was
> REDEPLOYED** (3 functions re-verified, `func publish --build remote`) and now runs the **taxonomy-v2
> engine** plus the 2026-07-03 email-classifier hardening (chase-phrase narrowing, `Re:`-reference
> false-reply guard, ref-extraction fixes, an `images_received`-before-reply-query rung); all four
> **`TRIAGE_*`** gates
> (`TRIAGE_REF_GATE_ENABLED`/`TRIAGE_CANCELLATION_ENABLED`/`TRIAGE_IMAGES_ROUTING_ENABLED`/`TRIAGE_CASE_UPDATE_ENABLED`)
> were flipped `true` on `cespk-orch-dev` (user-instructed) — the triage policy is now **ACTING**, not
> shadow-only. Seed `916_provider_domain_corrections.sql` **Section A** applied (user-approved):
> FW/TEN/AX/BC/DFD/BLACK `known_email_domains` corrected (PHA/Parkhouse insert stays operator-confirm —
> see [gated.md D3](../gated.md)). Exchange **`Mail.ReadWrite`** RBAC grant is **in progress** (device-code
> sign-in with the operator under way) — see [gated.md B4](../gated.md). Full detail:
> [`LIVE_FACTS.json`](../../LIVE_FACTS.json) `verifiedBy` + `gates` + `postgresCounts._rules_engine_v2_note`.
> Prior change **2026-07-03T15:40Z** — the **nine-task activation** (user-instructed):
> api **72→77** (+`createProviderApiKey`/`listProviderApiKeys`/`revokeProviderApiKey`, +`providerIntakeCase`
> `POST /api/provider-intake/cases` X-Api-Key-authed, +`internalWorkProviderAiAllowed`); orch redeployed,
> count **unchanged at 53** (the ai_allowed opt-out + the new scanned-PDF OCR fallback landed inside existing
> activities); SPA redeployed (single-select mailbox filter All+3 radiogroup, Admin **provider API-keys**
> panel, scrapped-gate removals). New Postgres table **`provider_api_key`** (delta
> `2026-07-03-provider-api-intake.sql` applied; public base tables **38→39**; audit codes 100000042–45;
> `choice_intake_channel_kind` 100000002 `provider_api`) — the **TKT-055 provider API intake channel**
> (ADR-0020; spec [docs/reference/provider-api-intake-spec.md](../reference/provider-api-intake-spec.md)):
> a Superuser mints per-provider keys in Provider settings, providers `POST` cases + Base64
> instructions/images; smoke confirmed missing/bad key → **401** (fail-closed); first-key mint + an
> end-to-end submit remain for the operator. **Gates flipped (user-instructed):** `OUTLOOK_MOVE_ENABLED=true`
> on **both** apps — the SPA "File to …" buttons are now live, but Graph moves will **403** until the
> operator adds the `Application Mail.ReadWrite` Exchange-RBAC assignment ([gated.md B4](../gated.md) steps
> 1–2 still pending); orch `PLATE_OCR_ENABLED=true` (plate OCR live) + `OCR_SCANNED_PDF_ENABLED=true` (new
> parse-activity fallback: PDF instruction + empty extraction → `POST /ocr-pdf` → coalesce) +
> `EMAIL_AI_ENABLED=true` + `AI_MODEL_ENDPOINT=https://digital-3339-resource.cognitiveservices.azure.com` +
> `AI_MODEL_DEPLOYMENT=gpt-5` (the D6 known spec gap — honouring `work_provider.ai_allowed` — was **closed
> first**: an explicit `false` now skips with reason `provider_ai_opt_out`). **Azure Maps / location-assist
> is now LIVE**: new resources `cespkmaps-dev` (Maps Gen2 G2, northeurope — uksouth is unsupported for
> Microsoft.Maps accounts), `cespkvision-dev` (ComputerVision F0, uksouth), and the
> `cespkloc-fn-a7tzj2` location-suggest Python Function App (+ its plan/KV/storage); api gates
> `LOCATION_ASSIST_ENABLED=true` / `AZURE_MAPS_ENABLED=true` / `LOCATION_SUGGEST_FN_URL`
> (`https://cespkloc-fn-a7tzj2.azurewebsites.net`) / `LOCATION_SUGGEST_FN_KEY` (KV ref); resource-group
> inventory **43→49**. Live smoke returned **200** with 3 ranked candidates on text clues; the photo-based
> candidate path still uses `StubPhotoSource` (Box byte-fetch unwired — text-clue geocoding fully works).
> api also gained `EVIDENCE_BLOB_ACCOUNT=cespkevidstdev01` / `EVIDENCE_BLOB_CONTAINER=evidence` + an MI
> grant of **Storage Blob Data Contributor** on `cespkevidstdev01` (for the provider-API Base64 image
> landing). `BOX_EMBED_ENABLED` / `BOX_METADATA_ENABLED` / `COPILOT_ENABLED` were **retired from code**
> (scrapped ideas — never live-set, nothing to unset). Prior change **2026-07-02T16:05Z** — **TKT-054 deploy** (inbox
> simplification, [020726 review](../reviews/020726/decisions.md)): orch **52→53** (+`outlook-move`
> queue trigger), api **69→72** (+`getOutlookMoveGate`/`moveInboundToOutlook`/`internalInboundOutlookMoved`),
> SPA redeployed (single condensed inbox — E-mail type, VRM|Ref split, status case-links, Suggested-action
> column; CSP re-verified). **Mailbox provenance fixed**: intake now resolves the subscribed UPN (Graph
> notifications echo the mailbox object-id GUID — why every chip read "Other source"); historical rows
> backfilled (264 `inbound_email` + 113 `case_`, zero non-address values remain —
> `deltas/2026-07-02-tkt054-source-mailbox-backfill.sql`). DDL delta `2026-07-02-tkt054-outlook-move.sql`
> applied (3 `outlook_move_*` columns + audit codes 100000039–41). **`OUTLOOK_MOVE_ENABLED` absent (off)**
> — the real Outlook filing stays dark pending the operator's Mail.ReadWrite Exchange-RBAC re-consent
> ([gated.md B4](../gated.md)); `OUTLOOK_MOVE_QUEUE_SERVICE_URL` set on api; api MI granted
> **Storage Queue Data Message Sender** on `cespkorchstdev01`. Prior change **2026-07-02T14:45Z** —
> rules-engine-v2 **Phase-3/4/5 final deploy**: api + orch redeployed (Image-Source **intermediary resolution** + parser-string →
> `work_provider_id` mapping; the **gated AOAI triage assist** — dead until `EMAIL_AI_ENABLED`; the
> TKT-047 **signature-image raster floor**), counts unchanged (orch 52 / api 69); the orch MI now holds
> **Cognitive Services OpenAI User** on `digital-3339-resource` (see `LIVE_FACTS.json` `foundry.miGrants`).
> SPA note: a 12:45Z env-less build shipped `undefined` `VITE_*` and blanked the app — root-caused and
> fixed ~13:55Z (`mockup-app/.env.production` now committed; live bundle re-verified). Earlier same day —
> **Phase-2 deploy**: orch **51→52** (+`triagePolicy`, shadow+acting decisions with always-on
> `triage_decision` customEvents), api **65→69** (+triage context/suggest-link + inbound
> suggestions/detach routes), SPA rebuilt (new tabs + suggestion/unlink affordances; CSP verified).
> All `TRIAGE_*` gates absent (off) **at that time** — intake behaviour unchanged then; **parser not yet
> redeployed** at that point (engine-v2.5 in-repo emitted taxonomy v2 — blocked on the gated.md **D7** DDL
> apply). **Both superseded 2026-07-03 (second wave, see the top of this file):** D7 is applied, the
> parser is redeployed on the taxonomy-v2 engine, and all four `TRIAGE_*` gates are `true`. Prior change **2026-07-02T10:55Z** —
> **Phase-0 deploy**: orch + parser redeployed (classify contract pass-through; engine re-cut at
> `engine-v2.1`), counts unchanged; live `/classify-email` probe returned `body_jobref` + the
> `report_attachment` signal. Prior change **2026-06-29T15:39Z** — Graph intake mailbox cutover finished
> (subscriptions + RBAC + `GRAPH_INTAKE_MAILBOXES` now the production set info@ + engineers@ + desk@; digital@
> removed). Prior snapshot **2026-06-28** verified function counts, feature gates, `httpsOnly`; Postgres corpus
> counts **not** re-verified (PG firewall blocked the verifier) — banded as last-known below.
> **The LIVE system is the Azure PaaS stack** (Static Web App + two Node/TypeScript Function Apps +
> Postgres Flexible Server, alongside the 6 retained Python Functions). The earlier **Power Platform
> implementation** (Power Apps Code App, Dataverse, ~16 Power Automate flows, the `cr1bd_*` custom
> connectors) **has been migrated to Azure (deployed)** and its Power Platform footprint **deprovisioned
> 2026-06-27** (the Dev sandbox, Code App, both solutions, custom connectors and the remaining
> `case-resolve` flow were deleted via `pac admin delete`; `CollisionSpike.zip` cold-exported off-repo). It
> survives in this document **only as a clearly-banded historical appendix**; do **not** treat any Power
> Platform row as live. The migration plan + reversible build live in [`migration/`](../../migration/).
> Pairs with [AGENTS.md](../../AGENTS.md) (rules/gotchas) and [CURRENT_STATUS.md](../../CURRENT_STATUS.md).
> Re-verify IDs with the toolkit at the bottom before relying on them.

> ## ⚠️ Whole-stack hard deadline — Free-Trial expiry
> The subscription `e6076573-23a5-46a8-acef-7e22d264e5db` is an **Azure Free Trial**
> (quotaId `FreeTrial_2014-09-01`). **The entire stack is disabled at the ~30-day mark unless it is
> upgraded to Pay-As-You-Go.** The **12-month free PostgreSQL Flexible Server allowance survives** the
> PAYG upgrade, but every other resource (Static Web App, both Function Apps, Key Vaults, Blob, the OCR
> ACA host) stops when the trial lapses. **Upgrading to PAYG is the top operational blocker.**

## Subscription & region
| Thing | Value |
|---|---|
| **Subscription** | `e6076573-23a5-46a8-acef-7e22d264e5db` — **Azure Free Trial** (`FreeTrial_2014-09-01`) |
| **Resource group** | `rg-collisionspike-dev` |
| **Primary region** | **UK South** (`uksouth`) — except the Static Web App control plane (`westeurope`, the one Free SWA region) |
| Intake mailboxes (Graph target) | **Configured = the production target: `info@` + `engineers@` + `desk@`** — all three Exchange-RBAC app-read scoped with live Graph push subscriptions (cutover finished 2026-06-29; the test/dev mailbox `digital@` was de-scoped from config and its subscription deleted). Subscription ids/expiry: see the Orchestration row + [`LIVE_FACTS.json`](../../LIVE_FACTS.json) `graphSubscriptions`. See also the Intake auth model section. |
| Tenant id | read with `az account show --query tenantId -o tsv` |

## Azure — live components (resource group `rg-collisionspike-dev`)

| Resource | Name / detail | Status |
|---|---|---|
| **SPA** — Static Web App (Free) | **`cespk-spa-dev`** (control plane `westeurope`) → **`https://proud-sky-04e318b03.7.azurestaticapps.net`**. The **preserved React/Vite app** built from `mockup-app/`. Sign-in is **MSAL / Microsoft Entra workforce** (staff-only). It carries **no secret and no Power SDK** — it calls the Data API over **REST + Bearer token** via `mockup-app/src/data/rest-client.ts`. | **LIVE** |
| **Data API** — Function App (BFF) | **`cespk-api-dev`** — **Node 20 / TypeScript Azure Functions v4** (source `api/`, deployed as an **esbuild bundle** `deploy/api/main.cjs`); **79 functions** registered (verified 2026-07-04T17:50Z — the retro-reconstruction deploy added the two **`/api/internal/retro/*`** routes (`internalRetroResolveExisting` + `internalRetroCreate`, ADR-0022/TKT-058); prior 77 via the nine-task activation's **provider API-key management routes** (`createProviderApiKey`/`listProviderApiKeys`/`revokeProviderApiKey`), **`providerIntakeCase`** (`POST /api/provider-intake/cases`, X-Api-Key-authed — TKT-055/ADR-0020) and **`internalWorkProviderAiAllowed`**; prior 72 via TKT-054's Outlook-filing gate/enqueue/write-back routes, 69 via rules-engine-v2 Phase-2 triage context/suggest-link internal routes + inbound suggestions/detach, 65 via 2026-07-01 M-E2 `logChase`, 64 via TKT-027 `internalCasesSetIngested`); **`httpsOnly` = true**. Validates the **Entra JWT** (`jose`) and authorizes by **app role** `CollisionSpike.User` / `CollisionSpike.Superuser` (Superuser formerly `CollisionSpike.Admin`, legacy name still accepted). v2 access tokens carry `aud` = the **API client-id GUID** (`fa2fb28c…`). Owns the status state-machine, dedup, audit writes, and gate reads. **Connects to Postgres** as the non-owner login `cespk_app` (RLS enforced; password a Key Vault reference). Feature gates set: **`ENRICHMENT_ENABLED=true`** / **`PDF_MAPPER_ENABLED=true`**, **`BOX_API_ENABLED`/`BOX_FOLDER_AT_INTAKE_ENABLED`/`BOX_FILEREQUEST_ENABLED`=true** (`BOX_FOLDER_ROOT_ID=392761581105`); plus the work-todo-spike Case/PO-allocator Box-fallback wiring **`BOX_FN_URL`** (plain host `cespkbox-fn-v76a47`) + **`BOX_FN_KEY`** (KV ref `cespk-pg-kv-dev/boxwebhook-fn-key`); **`OUTLOOK_MOVE_ENABLED=true`** (2026-07-03, user-instructed — the SPA "File to …" buttons are live, but Graph moves 403 until the operator's Exchange-RBAC `Mail.ReadWrite` grant lands, [gated.md B4](../gated.md)) + `OUTLOOK_MOVE_QUEUE_SERVICE_URL`; **`LOCATION_ASSIST_ENABLED=true`** / **`AZURE_MAPS_ENABLED=true`** / `LOCATION_ASSIST_API_BASE` + `LOCATION_SUGGEST_FN_URL` (`https://cespkloc-fn-a7tzj2.azurewebsites.net`) + `LOCATION_SUGGEST_FN_KEY` (KV ref) — Azure Maps / location-assist is **live** (2026-07-03); **`EVIDENCE_BLOB_ACCOUNT=cespkevidstdev01`** + `EVIDENCE_BLOB_CONTAINER=evidence` (MI granted Storage Blob Data Contributor, for the provider-API Base64 image landing); `EVA_API_ENABLED`/`VALUATION_ENABLED` absent (off). **`AUDIT_CASES_ENABLED=true`** (2026-07-04, user-instructed — ADR-0021 case-type writes + marker Case/PO mints acting). **`RETRO_CASE_ENABLED=true`** (2026-07-04 — the ADR-0022 retro routes act; honest `gated_off` refusal removed). `BOX_EMBED_ENABLED`/`BOX_METADATA_ENABLED`/`COPILOT_ENABLED` are **retired from code (2026-07-03)** — scrapped ideas, never live-set, nothing to unset. | **LIVE** |
| **Orchestration** — Function App | **`cespk-orch-dev`** (source `orchestration/`) — **62 functions** registered (verified 2026-07-04T17:50Z — the retro-reconstruction deploy (ADR-0022/TKT-058) added the keyed **`POST /api/retro-case`** drain starter, **`retroCaseOrchestrator`**, and 7 retro activities; prior 53 via TKT-054's gated `outlook-move` queue trigger; prior 52 via rules-engine-v2 Phase-2 `triagePolicy`, 51 after the same-day Phase-0 contract redeploy and 2026-07-01 TKT-027 `setIngested`; NOT 0 — esbuild `import.meta.url` banner held); **`httpsOnly` = true**. **Email intake is LIVE IN TESTING.** The intake chain is wired (PARSER/ENRICH/BOXWEBHOOK/EVASENTRY/**OCR** `_FN_URL` + KV-referenced function keys — OCR added 2026-06-30 (`OCR_FN_URL` plain host + `OCR_FN_KEY` → KV `cespk-pg-kv-dev/ocr-fn-key`) for registration-visible plate OCR, `EVIDENCE_BLOB_CONTAINER`; orch→Data API via **managed identity**; identity-based storage), and transport is **PUSH — Microsoft Graph change-notification subscriptions**, NOT delta-poll. **3 live push subscriptions exist** (the production set **info@ + engineers@ + desk@** Inbox `…/messages`, `changeType=created`, → `https://cespk-orch-dev.azurewebsites.net/api/graph-webhook`), expiry **~2026-07-06T14:38Z** (durable monitor — below; ids in [`LIVE_FACTS.json`](../../LIVE_FACTS.json) `graphSubscriptions`). `GRAPH_INTAKE_MAILBOXES` = info@ + engineers@ + desk@ (info@/desk@ `minIntakeDate` 2026-06-29, engineers@ 2026-06-27; the test mailbox digital@ was removed in the 2026-06-29 mailbox cutover and its subscription deleted). Same gates as the API (`ENRICHMENT`/`PDF_MAPPER`/`BOX_*` on), plus (2026-07-03, user-instructed) **`OUTLOOK_MOVE_ENABLED=true`** (the mover 403s until the operator's Exchange `Mail.ReadWrite` grant lands — [gated.md B4](../gated.md)), **`PLATE_OCR_ENABLED=true`** (plate OCR on registration-visible images now live), **`OCR_SCANNED_PDF_ENABLED=true`** (new parse-activity fallback: PDF instruction + empty extraction → `POST /ocr-pdf` → coalesce), and **`EMAIL_AI_ENABLED=true`** + `AI_MODEL_ENDPOINT=https://digital-3339-resource.cognitiveservices.azure.com` + `AI_MODEL_DEPLOYMENT=gpt-5` (the D6 `work_provider.ai_allowed` opt-out gap was closed and deployed **before** this flip — an explicit `false` skips with reason `provider_ai_opt_out`). **(2026-07-03 second wave)** all four **`TRIAGE_REF_GATE_ENABLED`/`TRIAGE_CANCELLATION_ENABLED`/`TRIAGE_IMAGES_ROUTING_ENABLED`/`TRIAGE_CASE_UPDATE_ENABLED`=true** — the Stage-B triage policy (ref-gate suggestion/link, cancellation routing, images-received routing, case-update routing) is now **ACTING**, not shadow-only telemetry. **(2026-07-04)** **`AUDIT_CASES_ENABLED=true`** — the ADR-0021 case-type pipeline (multi-doc parse, `engineer_report` evidence, marker mints) is **acting**. **(2026-07-04)** **`RETRO_CASE_ENABLED=true`** — the ADR-0022 retro fallback's **rung-1 any-status linking is acting**; `RETRO_BOX_ARCHIVE_ROOT_IDS` + `RETRO_OUTLOOK_SEARCH_ENABLED` stay **absent** (the Box + Outlook reconstruction rungs honest-skip until [gated.md D11](../gated.md) supplies the archive roots / flips the search gate). ✅ **Renewal RESOLVED (2026-06-29):** the plain `graph-renew` timer never fired on Flex scale-to-zero; renewal now runs via the durable `subscriptionMonitorOrchestrator` (eternal — durable timers wake a scaled-to-zero app) + a function-keyed `graph-renew` HTTP lever (see the renewal note below). ⚠️ **Reconcile note:** `runSubscriptionMaintenance` auto-CREATES missing intake mailboxes + renews, but does NOT prune subscriptions for mailboxes removed from `GRAPH_INTAKE_MAILBOXES` — a mailbox removal must be deleted by hand until a prune step is added (see gap 1 + `LIVE_FACTS.json` `subscriptionRenewalRisk.note`). | **LIVE IN TESTING (push subs; durable renewal)** |
| **Postgres** — Flexible Server (system of record) | **`cespk-pg-dev`** (**PostgreSQL v16**), database **`collisionspike`** — **39 base tables** (was 38 before the **2026-07-03** `provider_api_key` table — TKT-055's per-provider API-key store, delta `2026-07-03-provider-api-intake.sql` applied live: RLS ENABLE+FORCE + 2 policies + `cespk_app` GRANT, audit codes 100000042–45, `choice_intake_channel_kind` 100000002 `provider_api`; 0 rows until a Superuser mints the first key). **2026-07-03 second wave — D7/D8/embedding deltas applied**: the D7 taxonomy delta (`case_update`/`cancellation` choice-table rows + 3 subtypes + `inbound_email.body_jobref`/`conversation_id`), the Phase-4 `ai_suggestion.embedding` column (DDL only, unpopulated), and the D8 identification delta (Connexus `image_source` intermediary + its PCH/SBL links + PCH `known_email_domains=pch-ltd.com`) are all applied live; seed `916_provider_domain_corrections.sql` Section A also applied (FW/TEN/AX/BC/DFD/BLACK `known_email_domains` corrected). Detail: `LIVE_FACTS.json` `postgresCounts._rules_engine_v2_note`. **2026-07-04 — D9 + D10 applied**: `choice_case_type` 4 rows (+`audit_total_loss`/`diminution`), `choice_evidence_kind` `engineer_report` confirmed; the D9 EVA-deactivation was a **verified no-op** (zero EVA-named `work_provider` rows exist — see `postgresCounts._audit_case_type_note`). **work-todo-spike LIVE migration applied 2026-06-30** (idempotent, via Entra `digital@`→`SET ROLE csadmin`): NEW `ai_suggestion` table (RLS ENABLE+FORCE; `INSERT/SELECT/UPDATE` grant to `cespk_app`; case/evidence CASCADE + inbound_email SET NULL FKs), `inbound_email.suggested_category_code`/`suggested_subtype_code`, `choice_audit_action` 100000027–100000034, `choice_case_status` 100000011 `removed`, case-insensitive `uq_case_case_po` on `upper(case_po)`. Seeded corpus (**last-known, 2026-06-18 corpus load — NOT re-verified this snapshot**; the 2026-06-28 verifier was blocked by the PG firewall): `work_provider` **390**, `repairer` **32**, `image_source` **19**, `inspection_address` **2187** (175 confirmed + 2012 suggested — **reseeded 2026-07-06 TKT-080**: the suggested layer was replaced from the corrected in-repo corpus with per-row `provider_code` + geocodes; the 175 confirmed rows preserved byte-identical); `case_` **2** (live-growing — it was **20** at the 09:35Z owner read, then the **2026-06-30T10:21Z clean-slate reset** wiped transactional data to **0**, and a later read-only e2e verification found **2** post-reset live intakes on the new code [`dc307411` partial + `ca3acf21`/`QDOS26001` full]; `work_provider` **VERIFIED 2026-06-30T09:35Z** via Entra `azure_pg_admin` → `SET ROLE csadmin`, the owner read that BYPASSES RLS — an earlier `case_` **0** was a non-owner/stale RLS read artifact; **174 of 390** providers are active, and the active set was flipped `provider_automation_mode_code` **manual → review_auto** (`100000001`), the user-approved 'Both' box-sync fix — the 216 inactive remain manual). `repairer`/`image_source`/`inspection_address` remain last-known (not re-counted this pass). Schema is `migration/assets/schema/*.sql`. Free Postgres allowance survives the PAYG upgrade. | **LIVE** |
| **Retained Python Functions (UNCHANGED, 6)** | `cespike-parser-dev` (parser, `POST /api/parse` + `extract_images`; **3 functions** — redeployed **2026-07-04** (`func publish --build remote`, re-verified) at **engine-v2.6**: the engineer-report **layout-name fallback suppression** (an EVA/CNX report can no longer emit "EVA (Engineers)" as `work_provider`), the **`case_type` envelope** (`{value, dual, signals}` — audit/diminution detection incl. the QDOS dual "report + audit report" template), and `AP.`/`D.` **marker reference parsing**; the prior 2026-07-03 redeploy carried the **taxonomy-v2 engine** plus the 2026-07-03 email-classifier hardening (chase-phrase narrowing, `Re:`-reference false-reply guard, ref-extraction fixes, an `images_received`-before-reply-query rung); prior 2026-07-02 redeploy via config-zip `--build-remote true` (FC1 remote Oryx build) carried the **engine-v2.1 re-cut** (sibling PR 4 merged + B2 upstreamed; cloud-path behaviour-preserving), live `/classify-email` probe returned `body_jobref` + `report_attachment`; prior 2026-06-30 redeploy carried **TKT-001 multi-format extraction** (94902ce); live `/api/parse` on a `.docx` fixture returns a **FULL 12-field EVA extraction** (8/12 populated, vrm `HK19WTN`), no longer sparse) · `cespkenrich-fn-gi62sd` (enrichment — DVSA + DVLA direct via Entra `client_credentials` + X-API-Key) · `evavalidation` · `evasentry` (gated) · `cespkocr-fn-dev-glju3v` (OCR on Azure Container Apps, scale-to-zero, gated) · `cespkbox-fn-v76a47` (`box-webhook`, **10 routes** — work-todo-spike added `upload_file` `POST /api/box/folders/{id}/files`, the Blob→Box archive mirror scope-locked to `BOX_ALLOWED_ROOT_ID`) — **Box is LIVE (JWT Server Auth, 2026-06-28):** authed smoke `GET …/folders/392761581105/items` → **200** (re-verified 2026-06-30 post-redeploy; 7 case folders, read-only — no write performed). Called **directly by the Data API / orchestration** (function key / managed identity), not via any connector. | **LIVE (Box live; others gated where noted)** |
| **Key Vaults** | `cespkenrichkvgi62sd` (enrichment DVSA/DVLA secrets — populated, KV references resolve) · `cespkboxkvv76a47` (Box — holds **`box-config-json`** (the JWT `Config.JSON`, load-bearing) + webhook keys) · EVA vault (gated) · **`cespk-pg-kv-dev`** (the Postgres `cespk_app` password; the rotated **`graph-client-secret`**; and the retained **`parser-fn-key` / `enrich-fn-key` / `boxwebhook-fn-key` / `ocr-fn-key`** function keys (`ocr-fn-key` added 2026-06-30 for the orch `OCR_FN_KEY` ref) — all KV-referenced, no plaintext). | **LIVE** |
| **Evidence Blob** | `cespkevidstdev01` — evidence bytes (off-row; cases reference by `storage_path`). | **LIVE** |
| **Observability** | **App Insights is per-app, NOT shared:** **`cespk-api-dev`** (Data API, appId `95e70d0f…`) and **`cespk-orch-dev`** (orchestration, appId `7c7ea68a…`) EACH have their OWN component; the **parser + retained Python fns** log to `cespike-parser-ai-dev` (appId `da68d9aa…`) + **Log Analytics** `cespike-parser-law-dev`; **OCR** keeps its own `cespkocr-ai-dev` / `cespkocr-law-dev` pair. | **LIVE** |
| **Container Registry** | `cespkocracraeee76` (Basic) — holds `ce-ocr:latest`, pulled by the OCR ACA host via UAMI AcrPull. | **LIVE** |
| **AI Foundry** | **`digital-3339-resource`** (AIServices S0, uksouth; project `digital-3339` + its own App Insights / Log Analytics) — **model deployments EXIST since 2026-07-01T14:41Z (operator-created)**: **`gpt-5`** (2025-08-07, **GlobalStandard** — inference may process outside the UK; at-rest stays uksouth; no UK data zone exists) and **`text-embedding-3-large`** (**regional Standard** — processed in uksouth). Capacities/quota/RAI policy/version-upgrade detail: [`LIVE_FACTS.json`](../../LIVE_FACTS.json) `foundry`. **EMAIL_AI is LIVE (2026-07-03, user-instructed production flip):** `EMAIL_AI_ENABLED=true` + `AI_MODEL_ENDPOINT` + `AI_MODEL_DEPLOYMENT=gpt-5` are set on `cespk-orch-dev`, which reaches the account **keyless** via its managed identity (**Cognitive Services OpenAI User**, granted 2026-07-02). Suggestion-only posture unchanged: a PII-scrubbed AOAI call for abstain/uncorroborated triage rows, writing `ai_suggestion` rows for human accept/reject; the per-provider `work_provider.ai_allowed` opt-out (explicit `false` → skip, reason `provider_ai_opt_out`) was implemented and deployed **before** the flip. `disableLocalAuth=false` still — the Foundry **keyless flip** (disabling key-based auth entirely) remains operator-gated ([gated.md D6 item 5](../gated.md)), as does the live `inbound_email` PII export (D6 item 4). This is the Stage-C target of the [rules-engine-v2 plan](../plans/rules_engine_v2_plan_9ba034c4.plan.md), now **acting live**. | **LIVE (deployed + wired; keyless-flip and PII-export items remain gated)** |

| **Location-assist / Azure Maps** | **LIVE (2026-07-03).** `cespkmaps-dev` (**Microsoft.Maps/accounts**, Maps **Gen2 G2**, `northeurope` — `uksouth` is unsupported for Maps accounts) + `cespkvision-dev` (**ComputerVision F0**, `uksouth`, for OCR on photo-based clues) + `cespkloc-fn-a7tzj2` (Python Function App, the location-suggest ranking service; + `cespkloc-plan-a7tzj2` / `cespklockva7tzj2` (KV) / `cespklocsta7tzj2` (storage), the fn's MI holding KV Secrets User + Blob Owner). Wired via api gates `LOCATION_ASSIST_ENABLED=true` / `AZURE_MAPS_ENABLED=true` / `LOCATION_SUGGEST_FN_URL=https://cespkloc-fn-a7tzj2.azurewebsites.net` / `LOCATION_SUGGEST_FN_KEY` (KV ref). Live smoke: **200** with 3 ranked candidates from text clues. **Limit:** photo-based candidates still use `StubPhotoSource` — the Box byte-fetch wiring for photo-derived location clues is real cross-app work, not yet done; text-clue geocoding is fully live. | **LIVE (text-clue path; photo-clue seam pending)** |

### Orphans & deprovisioned (cost / cleanup tracking)
- **`valuationbot-mcp`** (Container App) — **DEPROVISIONED 2026-06-27** (was public-internet; deleted, its image kept in ACR). It belongs to a **separate suite project**, not this stack.
- ~~`digital-3339-resource` orphan~~ — **RESOLVED 2026-07-01: no longer an orphan.** The operator created model deployments on it (14:41Z, after that day's earlier snapshots) and it is now a documented live component (see the **AI Foundry** row above + `LIVE_FACTS.json` `foundry`). The former "no model deployments / keep-or-delete" flag is superseded.

## Auth & identity (Entra workforce)
- **Sign-in:** Microsoft **Entra ID workforce** via **MSAL** in the SPA (`mockup-app/src/auth/`). The SPA
  acquires an access token for the API scope and sends it as a Bearer token; the **Data API validates the
  JWT with `jose`** and authorizes by app role.
- **App roles:** **`CollisionSpike.User`** and **`CollisionSpike.Superuser`** — the full-privilege role
  **`CollisionSpike.Superuser`** was **renamed from `CollisionSpike.Admin`** (same app-role id, so the
  existing assignment carried over; `auth.ts` still accepts the legacy `CollisionSpike.Admin` for
  back-compat, and the settings route is Superuser-gated). These map the old two Dataverse security roles
  1:1. A third role **`CollisionSpike.Engineer`** is **defined but NOT yet enforced** — a placeholder for
  future assessment/engineer functionality.
- **Token audience:** v2 access tokens carry `aud` = the **API app-registration client-id GUID**
  (`fa2fb28c…`); the API validates against this. Audience-form hardening is in progress (see gaps).
- **Assignment state:** **only ONE staff principal is app-role-assigned so far.** Any other signed-in user
  will reach the API and **403** until an admin assigns them a role.

## Intake auth model — Exchange RBAC for Applications + Graph PUSH subscriptions
The intake app reads the shared mailboxes under **Exchange RBAC for Applications**, **not** a tenant-wide
Graph grant: an **Exchange Administrator** grants the intake service principal a **resource-scoped** Graph
mailbox role with `New-ServicePrincipal` / `New-ManagementScope` / `New-ManagementRoleAssignment` — **no
Global Administrator and no tenant-wide admin consent**. On top of that RBAC grant, intake uses **Graph
change-notification (PUSH) subscriptions** — one per Inbox, `changeType=created`, pushing to
`…/api/graph-webhook` — bootstrapped/renewed by the durable `subscriptionMonitorOrchestrator` (+ `graph-renew` timer backstop / HTTP lever). **This is PUSH, not delta-poll.**

**Live state (verified 2026-06-29 — see the registry table above for the authoritative values):** the
**production set info@ + engineers@ + desk@** are ALL Exchange-RBAC app-read scoped (scope
`CollisionSpike-Intake-Prod`, `Application Mail.Read`) and each has a **live push subscription** (expiry
~2026-07-06T14:38Z; durable monitor). The 2026-06-29 cutover added info@ + desk@ (their subscription creates
succeeded once the ~30min–2h Exchange-RBAC permission cache cleared — the earlier 403s were the cache, not a
wrong grant) and **removed the test/dev mailbox digital@** (de-scoped from config + subscription deleted).
engineers@ is a real production mailbox; digital@ remains RBAC-scoped but is no longer an intake target.

> This **supersedes** any earlier statement that "Graph `Mail.Read` needs Global-Admin / admin consent" **and**
> any earlier "delta-poll, no push subscription" wording. Mailbox access is granted by an **Exchange
> Administrator at mailbox scope**, and the read pattern is a **change-notification PUSH subscription**.
> Correct both wherever they still appear.

## Known live gaps (state honestly — do not paper over)
1. **Email intake is LIVE IN TESTING — now on the production mailbox set.** `cespk-orch-dev` is live with
   **3 Graph PUSH subscriptions** over the production set **info@ + engineers@ + desk@** (all Exchange-RBAC-scoped;
   mailbox cutover finished 2026-06-29, test mailbox digital@ removed). Remaining for **production**:
   set `EVIDENCE_BLOB_CONNECTION` (prefer MI), assign the orch MI an app-role on the Data API, and wire the
   Azure Monitor heartbeat alerts.
   - ⚠️ **Subscription-reconcile durability gap (recommended small code fix).** `runSubscriptionMaintenance`
     (`orchestration/src/lib/subscriptions.ts`) auto-CREATES missing intake mailboxes and renews all existing
     subs, but it **never prunes** — a mailbox REMOVED from `GRAPH_INTAKE_MAILBOXES` keeps its subscription
     (and gets renewed forever). That is why the de-scoped digital@ sub had to be deleted by hand in this
     cutover. Recommend adding a prune pass (delete any of OUR subs whose `mailboxOfResource(resource)` is not
     in `intakeMailboxes()`) so a mailbox-set change self-reconciles add+remove on the next maintenance tick.
   - ✅ **Renewal RESOLVED (2026-06-29, AIE Wave A).** Root cause: a plain timer trigger isn't woken on Flex
     scale-to-zero, so `graph-renew` logged 0 executions and the 2 subscriptions were heading for a silent
     lapse. Fix: the durable **`subscriptionMonitorOrchestrator`** (eternal — renew → durable timer →
     continueAsNew; a durable timer message wakes a scaled-to-zero app) plus a function-keyed **`graph-renew`
     HTTP** lever and an intake-starter bootstrap; the `graph-renew` timer is kept as a backstop. Subscriptions
     renewed to 2026-07-06T10:19Z. **Operator watch:** confirm an unattended renew at the next ~6h durable-timer
     wake (a `graph-renewal-success` trace with no manual trigger).
2. **Connection & secret security — RESOLVED (2026-06-26 / 2026-06-27).** The Data API connects as the
   **non-owner** login **`cespk_app`** (`rolsuper=false`, `rolbypassrls=false`) with its password held as a
   **Key Vault reference** (no cleartext), and sets the DB app-role per connection via `-c app.role=staff` (the
   `PGAPPROLE` app-setting). The authored **RLS by app role is now enforced** — the prior server-admin
   `csadmin` connection bypassed it. Grants are least-privilege (no DELETE on any table; `audit_event`
   INSERT/SELECT only — append-only). **On 2026-06-27 the remaining plaintext exposures were also remediated:**
   `GRAPH_CLIENT_SECRET` rotated into `cespk-pg-kv-dev/graph-client-secret` (orch MI granted Key Vault Secrets
   User — it previously had zero role assignments); both Function Apps' storage moved to **identity-based**
   (`allowSharedKeyAccess=false`, MIs granted Storage Blob Data Owner; orch also Queue/Table Data Contributor
   for Durable); `DOCINTEL_KEY` neutralized (Document Intelligence local-auth disabled, ocr MI keyless via
   Cognitive Services User); the parser/enrich/box function keys moved to KV references (the parser host key
   rotated). Only `APPLICATIONINSIGHTS_CONNECTION_STRING` (not a secret) and the platform-managed
   `WEBSITE_AUTH_ENCRYPTION_KEY` remain plaintext — acceptable, no action.
3. **Free-Trial → PAYG deadline** (the whole-stack expiry above).
4. **Staff app-role assignment incomplete** — only one principal assigned; others 403.
5. **Durable auth error-handling + audience-form hardening in progress** (token-validation robustness).

## System of record — Postgres (was Dataverse)
The authoritative store is now **PostgreSQL Flexible Server `cespk-pg-dev` / db `collisionspike`**. The
domain model, the 12-field EVA contract, the `choice_*` lookup tables (which **preserve the EVA integer
codes verbatim**), and the seeded provider/repairer/inspection-address corpus are documented in
[data-model.md](./data-model.md). The DDL is `migration/assets/schema/*.sql`.

## Current vs intended (M1 pipeline)
Intended chain: **intake → classify-persist → parse → provider-match → case-resolve → status-evaluate →
enrich → finalize (EVA + Box) → chasers**, driven by the **orchestration** app's Durable pipeline.
**Live today (Azure):** the SPA + Data API + Postgres are up and serve read + manual case-create; the
6 Python Functions are reachable (parser/enrichment live, **Box live**, EVA/OCR gated). **Live in testing:**
the **automated intake pipeline** — orchestration runs with **3 Graph PUSH subscriptions** over the production
mailbox set **info@ + engineers@ + desk@** (mailbox cutover finished 2026-06-29; test mailbox digital@ removed).
Still gated: finalize EVA (gated), chasers. So a staff member can sign in, browse, and create a case manually,
**and** email to the three scoped production mailboxes can auto-create cases (subscription renewal is now
durable — see the renewal note above).

**EVA path (domain — unchanged):** the active EVA path is **JSON drag-drop, not REST — by a vendor
constraint.** Minotaur Software's Sentry API currently routes only **one principal code** per API
submission (it cannot handle the multiple work-provider codes), so the EVA-REST gate stays **OFF** pending
Minotaur's patch + a parity test. The EVA **test** environment exists (test creds held in Key Vault /
Infisical). See [eva-sentry-api.md](./eva-sentry-api.md).

**Enrichment (domain — unchanged):** the enrichment Function calls **DVSA + DVLA directly** via Entra
`client_credentials` + X-API-Key (no Google-Cloud gateway). DVSA/DVLA secrets are Key Vault references in
`cespkenrichkvgi62sd`. Mileage = MOT-odometer estimate only (near-new vehicles return none, by design).

---

## Live-verification toolkit (Azure)
```pwsh
# Resource inventory in the dev RG
az resource list -g rg-collisionspike-dev -o table

# Static Web App (SPA) hostname + status
az staticwebapp show -g rg-collisionspike-dev -n cespk-spa-dev --query "defaultHostname" -o tsv

# Function Apps — which functions are actually deployed (verified 2026-07-04T17:50Z: api 79, orch 62, parser 4, box-webhook 12)
az functionapp function list -g rg-collisionspike-dev -n cespk-api-dev  -o table   # expect: 79 functions
az functionapp function list -g rg-collisionspike-dev -n cespk-orch-dev -o table   # expect: 62 functions (live — 3 push subs)
az functionapp function list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 -o table               # expect: 12
az functionapp function list -g rg-collisionspike-dev -n cespike-parser-dev-x7xt3d5ovhi7y -o table # expect: 4

# Postgres — table count + seeded corpus counts (psql via the admin connection string)
#   SELECT count(*) FROM information_schema.tables WHERE table_schema='public';      -- expect 40 (case_po_floor added 2026-07-04)
#   SELECT count(*) FROM work_provider; SELECT count(*) FROM inspection_address;     -- 390 / 2209
#   SELECT count(*) FROM case_;                                                       -- 20 (read as csadmin/owner; bypasses RLS)

# Subscription quota class (confirms Free Trial vs PAYG)
az account show --query "{name:name, id:id}" -o json
#   az rest --method get --url "https://management.azure.com/subscriptions/<id>?api-version=2020-01-01" \
#     --query "subscriptionPolicies.quotaId"   # FreeTrial_2014-09-01 until upgraded

# Retained Python Functions reachability (parser shown)
curl.exe -i -X OPTIONS "https://cespike-parser-dev.azurewebsites.net/api/parse" -H "Origin: https://proud-sky-04e318b03.7.azurestaticapps.net" -H "Access-Control-Request-Method: POST"
```

---

# Appendix — HISTORICAL: the prior Power Platform environment

> **NOT LIVE.** Everything below describes the **prior Power Platform implementation**, which was
> **migrated to the Azure stack above** and then **deprovisioned 2026-06-27** (the migration's deprovision
> step [`migration/90-deprovision-power-platform.md`](../HISTORICAL/migration/90-deprovision-power-platform.md) was
> executed — the Dev sandbox deleted via `pac admin delete`). It is **no longer the live system** and the
> resources below no longer exist. Retained for provenance. Do not rely on these resources or treat any of
> them as current.

## (historical) Environment & identity
| Thing | Value |
|---|---|
| Work env | `Collision Engineers - Dev` — id `b3090c42-51fb-ee24-9868-474da322a3ad` |
| Org (Dataverse) URL | `https://collisionengineers-dev.crm11.dynamics.com` |
| Default env (was not used) | `Collision Engineers (default)` — id `858cf5b3-aa0a-47a6-9b40-4851fd0afa94` |
| Maker / intake mailbox | `digital@collisionengineers.co.uk` |

## (historical) Code App
| Thing | Value |
|---|---|
| App id | `da7ba7af-9ffc-4c70-8f75-1f053ca354da` |
| Display name | `Collision Engineers - Intake` |
| Source | `mockup-app/` (React + Vite) — **the same source now built into the live Static Web App** (the React app was preserved; only its data seam changed from the Power SDK/Dataverse to the REST client). |

## (historical) Dataverse solution
`CollisionSpike` (schema, prefix `cr1bd`, id `fb532f91-f26a-f111-ab0c-0022481b614c`) +
`CollisionSpikeFlows` (flows). All `cr1bd_*` tables/choicesets were the source the **Postgres schema was
translated from** (every `cr1bd_*` global choiceset → a `choice_*` lookup table; EVA integer codes
preserved). The Dataverse org was **deprovisioned 2026-06-27** with the rest of the Power Platform footprint.

## (historical) Power Automate flows
~16 cloud flows (`category eq 5`) — CS Intake (shared mailbox), CS Provider Match, CS Case Resolve, CS
Classify + Persist, CS Parse, CS Status Evaluate, CS Enrich, CS Finalize EVA + Box, CS Chaser Draft, CS
Job Sheet Import, plus the Phase-7 Box flows. **Their orchestration logic was re-expressed in the
TypeScript `cespk-orch-dev` Durable pipeline** (now deployed + wired, not yet live). The flows themselves
were **deprovisioned 2026-06-27** (deleted with the Dev sandbox via `pac admin delete`; their definition
JSON was removed in the migration purge — the cutover narrative survives in [docs/HISTORICAL/migration/](../HISTORICAL/migration/)).

## (historical) Power Platform custom connectors
`cr1bd_ceparser`, `cr1bd_dvsaenrich`, `cr1bd_evasentry`, `cr1bd_evavalidation`, `cr1bd_box_rest`,
`cr1bd_box`, `cr1bd_dataverse`, `cr1bd_sharedmailbox_office365`, … — the Power Platform delivery vehicle
that let the Code App / flows reach the Azure Functions and external systems under `connect-src 'none'`.
**Obsolete in the Azure stack:** the SPA reaches the Data API directly over REST, and the Data API /
orchestration call the Python Functions directly (function key / MI) — **no connector layer**.
