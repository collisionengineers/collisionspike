# Go-Live Preparation Sprint — collisionspike

> **Executor note:** this plan was authored 2026-07-04 (Fable planning session) for execution by an
> **Opus** session as a dynamic multi-agent workflow (Sonnet 5 fan-outs, Opus for build-critical
> work). Every live fact below was verified against source/LIVE_FACTS at authoring time; re-verify
> gates/counts against [LIVE_FACTS.json](./LIVE_FACTS.json) before acting on them.

## Context

The system is live-intaking on info@ + engineers@ + desk@ but is **not production-grade yet**: the DB holds ~165 cases / ~355 inbox emails processed by since-fixed code (misclass fixes, taxonomy v2, provider corrections landed *after* ingestion, so the UI shows wrong data); a cluster of 12 tickets sits "acting but awaiting live proof"; the dashboard/inbox/inspection-picker have concrete UX defects; the FILE.UPLOADED Box webhook was never subscribed; the Box CLI is **not installed at all** (that's the "bugged out" state — nothing on Windows or WSL); there is no operator-facing go-live runbook; and the operator wants a chat-style AI helper. This sprint brings everything to full production standard **without going live** — go-live itself stays operator-triggered.

**Operator decisions already taken (binding):**
1. **Replay = WIPE & REBUILD** — clear derived data, re-ingest full mailbox history from Graph (read-only) through the live pipeline. Accepted loss: staff triage states/stamps since 2026-06-30 (mitigated by pre-wipe export + re-stamp).
2. **Box sandbox writes allowed** — strictly under dev mirror root `392761581105`, plus creating the FILE.UPLOADED webhook via our own facade. Real archive root + live mailboxes stay read-only (Graph grant is Mail.Read — mailboxes physically can't be mutated).
3. Executed by **Opus** as a dynamic multi-agent workflow (Sonnet 5 fan-outs, Opus for build-critical work).

**What is yet to be switched on (current OFF/absent set):** `EVA_API_ENABLED` (blocked on Minotaur — stays off), `AI_ASSIST_ENABLED` (TKT-015 suggestion surface), `RETRO_OUTLOOK_SEARCH_ENABLED`, `RETRO_BOX_ARCHIVE_ROOT_IDS`/`BOX_READONLY_ROOT_IDS` (operator D11), `BOX_FILE_REQUEST_TEMPLATE_ID` (empty → File-Request copy no-ops), FILE.UPLOADED webhook (not subscribed), new `AI_CHAT_ENABLED` (this sprint). **Operator critical path (cannot be done by agents):** A1 Free-Trial→PAYG upgrade (hard dated deadline — whole stack disables at ~30-day mark), C1 staff app-role roster (only 1 principal assigned; TKT-010 blocked on it), D1 EVA test creds, D3/D4 provider domains + PHA principal, D11 archive root ids + Viewer grant + archive listing, B4 Exchange Mail.ReadWrite cache + live move test, TKT-004 production Box root id, E2 legal/policy inputs, sample-or-decision tickets TKT-032/035/041(13th)/057.

---

## Phase DAG

```
P0 preflight ─→ P1 corpus sweep ─→ P2 fix wave ─→ P3 WIPE+REPLAY ─→ P3V verify+relink ─→ P6 Box webhook+E2E ─→ P8 docs+readiness
                        │                                                      ↑
P4 UI/UX build ────────────────────(deploy-freeze during P2gate→P3V)──────────┤ (browser sweep after P3V)
P5 AI chat ────────────────────────(same freeze rule)──────────────────────────┤
P7 ops hardening ──────────────────(auth-plane items strictly after P3V)───────┘
```
**Hard chain:** P0→P1→P2→P3→P3V→P6→P8. P4/P5/P7 build in parallel; their **deploys** obey the freeze: **no api/orch/parser deploys and no auth-plane changes between the P2 eval-green gate and P3V pass**. P3 runs in a low-traffic window (Sunday ideal).

---

## Critical code-verified traps (executor MUST honor — each was verified in source)

1. **Box folder create 409 = silent adoption**: `functions/box-webhook/box_client.py` `create_folder()` returns the *existing* folder id on `item_name_in_use` (`outcome='reused'`). Without prevention, replayed cases silently attach evidence to stale folders. Prevention = floor-seed **before** wipe (names can never repeat) + move old folders to a holding folder.
2. **Replay via the live queue no-ops**: `orchestration/src/functions/intake-starter.ts` derives `instanceId = intake-<safeGraphMessageId>` and skips existing non-Failed instances; the Durable task hub survives the DB wipe. Replay must start `intakeOrchestrator` as a **sub-orchestrator under a new namespace** `replay-r1-<safeId>` — never re-enqueue `intake-messages`.
3. **Inbox-only paging misses filed mail**: `OUTLOOK_MOVE_ENABLED=true` since 2026-07-03 — staff filing moves messages to Inbox *child* folders. The new pager must span Inbox + descendants (client-filter by `parentFolderId`, excluding Sent/Deleted/Junk/Drafts). DB dedup key `source_message_id` = `internetMessageId` (stable across moves) — confirmed `api/src/functions/internal.ts:1103` `ON CONFLICT (source_message_id) DO UPDATE`.
4. **`enrich` is the un-wrapped tail step** of `intakeOrchestrator.ts` (step 6, ~line 552) — a sustained 5xx fails the instance *after* case creation and a restart short-circuits `already_ingested`. Driver must catch per-child failures, record, continue.
5. **Wipe = DELETE, never `TRUNCATE ... CASCADE`** (it would follow referencing FKs into `audit_event`/`inbound_email`). `audit_event` is append-only and KEPT; its `case_id` FKs auto-SET-NULL by design.
6. **FILE.UPLOADED webhook only AFTER P3V** — otherwise the replay's own archive storm (hundreds of uploads) sprays notifications at the facade.
7. **AOAI/triage cannot fail the pipeline** (`callTriageModel` degrades to abstain; wrapped) — keep `EMAIL_AI_ENABLED` ON during replay for live-fidelity; cost is trivial at concurrency 1.

---

## P0 — Preflight & guardrails (Opus inline + small Sonnet tasks)

1. **Sprint tickets** per repo protocol (`docs/tickets/`, frontmatter, BOARD.md): TKT-059 replay-wipe-rebuild, TKT-060 ai-chat-helper, TKT-061 box-cli-webhook-e2e, TKT-062 inspection-shortlist, TKT-063 go-live-docs; author the orphan **TKT-048** (folder exists with only `1.png` — no-image-previews; investigate what it shows and write the ticket).
2. **PAYG check**: `az account show` quotaId — if still FreeTrial, RED-flag in every deliverable; sprint proceeds but runbook marks the hard deadline (operator item A1).
3. **Subscription renewal check**: subscriptions expire **2026-07-06T14:38Z**; verify `subscriptionMonitorOrchestrator` fires unattended (KQL: `graph-renewal-success` with no manual trigger); keep the manual `graph-renew` lever on the runbook.
4. **Heartbeat/KQL alerts pulled forward from P7** — alarms must watch the replay, not be installed after it: function failure-rate alert (api/orch), subscription-expiry canary, DB-connectivity probe (az monitor metrics alerts; WSL).
5. **Box CLI install + auth** (currently absent everywhere): Windows `npm i -g @box/cli`; JWT auth via KV secret `cespkboxkvv76a47/box-config-json` → temp file → `box configure:environments:add` → verify `box users:get` + `box folders:get 392761581105` → secure-delete temp file. Fallback: standalone installer per developer.box.com/guides/cli. New playbook `docs/azure/box-cli.md` (+ platform-routing line: Windows npm; Exchange stays Windows PowerShell; az/psql stays WSL).
6. **pg_dump rehearsal** from WSL (`--schema-only` first), using the postgres.md transient-firewall + AAD-token pattern with `--role=csadmin`; verify `pg_restore -l` lists tables and row counts match live (guards the FORCE-RLS dumps-zero-rows failure mode).
7. **Pre-wipe baseline**: run the full P3V verification suite against current data and save results — post-replay judgments are **deltas vs this baseline** (a pre-existing count bug ≠ replay regression).

**Gate:** alerts firing test OK; dump verified; CLI authenticated; baseline saved.

## P1 — Read-only Graph corpus sweep + learning (Sonnet fan-out; pager build = Opus)

1. **Build the extended pager + replay driver in dry-run form** (this IS P3's driver, rehearsed read-only): `orchestration/src/lib/graph.ts` add `listMessagesSince(mailbox, sinceIso, untilIso, pageUrl?)` — `$filter` receivedDateTime range, `$orderby` asc, `@odata.nextLink` loop, whole-mailbox scoped to Inbox+descendants (leave `listMessageIdsSince` untouched). New keyed starter `POST /api/replay-backfill` cloning the `gated/retro-case.ts` starter pattern (authLevel function, deterministic driver id, getStatus dedup), driver orchestrator with 3-way chronological mailbox merge, `continueAsNew` every ~25, `setCustomStatus` progress, `dryRun` mode = Graph metadata + parser `/classify-email` only, **zero DB writes**, emitting a manifest NDJSON per message `{mailbox, internetMessageId, receivedDateTime, predicted category/subtype, keys}`.
2. **Deep-history analysis sweep** (beyond the intake window, as far back as mailboxes go): analysis-only, never DB writes; classify via the sibling engine locally (`../cedocumentmapper_v2.0`) or the stateless parser route. Sonnet shards per mailbox × time-slice. Outputs (local, **gitignored** per `scripts/eval-email/export-live-labels.md` governance — live PII never committed): provider/domain coverage report (feeds D3/D4 corpus additions), per-provider ref-format catalogue (feeds retro key ladder + linking), misclass candidates vs current rules, unknown senders, attachment-format stats (TKT-022 evidence), monthly volume (capacity planning).
3. **Manifest for the intake window** (minIntakeDate → now) = P3's ground truth.

**Gate:** manifest complete + reconciles with mailbox counts; learning report written; fix list agreed.

## P2 — Fix wave from learning (Opus for classifier; Sonnet for corpus SQL)

- Classifier tweaks: edit in sibling `cedocumentmapper_v2.0` → tests → re-vendor → parser deploy (ADR-0018 discipline). Add new eval cases to `scripts/eval-email/manifest.json`; **`run_eval.py` vs `baseline-v2.json` must stay green** (version to v3 if expectations legitimately change).
- Targeted tickets: **TKT-022** .docx first-class extraction (P1 backlog — sibling-side); **TKT-043** its own sample still misses — fix pass; **TKT-034** reconcile (gate `TRIAGE_IMAGES_ROUTING_ENABLED=true` but ticket says "not built" — investigate, finish the 3-step fallback or correct the ticket).
- Provider corpus additions **derivable from live email evidence** via reviewed SQL delta (deltas/ pattern); operator-only items (PHA principal, domainless providers needing business knowledge) go to the operator checklist instead.

**Gate (starts the deploy freeze):** eval green; parser redeployed; `verify-all.mjs` 9/9; no further api/orch/parser deploys until P3V passes.

## P3 — Wipe & rebuild replay (Opus, serialized, low-traffic window)

Ordered runbook (all steps scripted; each verifiable):
1. **Human-work export** (read-only CSVs keyed by `source_message_id`/`case_po`): staff-stamped Case/POs, notes, chasers, human triage overrides (`triage_state in ('actioned','dismissed')`, `classifier_mode='human'`), reviewed `ai_suggestion` rows.
2. **pg_dump** full (`-Fc`), verify row counts in dump match live.
3. **Box holding move**: create `_pre-replay-2026-07-XX` under root 392761581105; move existing case folders into it via Box CLI (`box folders:update <id> --parent-id <holding>`) — facade has no move op; do NOT build one for a one-shot tidy. Reversible; delete only after go-live sign-off.
4. **Capture T0** (wipe timestamp); confirm no `Running` `intake-*` instances.
5. **Wipe delta** `migration/assets/schema/deltas/2026-07-XX-replay-wipe-and-floor-seed.sql` (idempotent, one transaction, postgres.md runbook, `SET ROLE csadmin; SET app.role='admin'`): (a) new `choice_audit_action` `replay_epoch`; (b) **seed `case_po_floor` FROM pre-wipe `case_` maxima** (GREATEST-upsert, per-marker prefixes matching `api/src/lib/case-po.ts` semantics) — this makes folder-name reuse impossible by construction; (c) epoch audit marker with pre-counts; (d) `DELETE FROM ai_suggestion; DELETE FROM inbound_email; DELETE FROM case_;` (cascades evidence/provenance/chaser/note). **KEEP:** work_provider, repairer, image_source, inspection_address, junction tables, provider_api_key, case_po_floor, app_setting, choice_*, audit_event, **improvement_signal** (it's the learning corpus). VERIFY footer in-file.
6. **Smoke replay of 3 messages** (`replay-r1-*` namespace) → inspect → then full run: `POST /api/replay-backfill {epoch:'r1', until:T0, concurrency:1}`. Sequential (~4h for 355; ordering is load-bearing for linkReply/ref-gate/dedup). Gates stay at production values (EMAIL_AI, ENRICHMENT, BOX_FOLDER_AT_INTAKE, TRIAGE_* all ON) — the rebuilt state must be what live would have produced. `AUDIT_CASES_ENABLED` is already true → markered POs mint live (closes TKT-056's probe).
7. Live PUSH keeps running and owns `[T0, ∞)` — no gap, races benign (shared `source_message_id` dedup + 409 backstop + drop_duplicate).

## P3V — Verification + relink (Sonnet fan-out per check + per ticket; Opus adjudicates)

- **A. Manifest reconciliation (primary gate):** every manifest row has an `inbound_email` row (LEFT JOIN → 0 missing); per-mailbox counts match; no extra pre-T0 rows.
- **B. DB consistency vs baseline:** category/status distributions match manifest predictions (exact for eval-locked subset); every non-duplicate receiving_work resolves to a case; every case's `box_folder_id` resolves via facade and **none point under `_pre-replay-*`** (proves no 409-adoption); zero minted POs ≤ floor; VRM twins carry duplicate-flag audit (not silent dupes — the dashboard's double "PK20FWT" pair class); queue counts == queue list lengths (vs baseline delta); pre-epoch audit rows have `case_id IS NULL`.
- **C. Per-ticket closures:** replay IS the live occurrence for **TKT-021, 023, 027, 028, 031, 039, 041, 046, 047, 051, 056** — assert each ticket's sample `internetMessageId` landed on the locked category/subtype + ticket-specific side-effect (from each ticket's `verification.md`); **TKT-058** rung-1 proof (unmatched billing/update → `retroResolveExisting` link or honest failure audit). Update tickets + BOARD.md.
- **D. KQL:** failed orchestrations == driver `failed[]` (each explained); parser/enrichment 5xx bursts; box facade non-2xx ≈ 0; triageClassify abstain ratio sane.
- **Relink sweep:** `inbound_email WHERE case_id IS NULL AND received_on >= T0 AND category IN (update/cancel/query/billing)` → drain via existing `POST /api/retro-case`.
- **Re-stamp:** re-apply exported staff Case/POs via the Set-Case/PO PATCH; re-apply human triage states that still matter.
- **Failure handling:** targeted re-run of driver `failed[]`; enrich-tail failures get manual enrichment re-trigger.

**Gate:** A–D pass or explained; freeze lifts.

## P4 — UI/UX production pass (fluent-spa-designer builds; code parallel-safe, SPA deploy any time — SWA is outside the freeze; final sweep after P3V)

Fixes (defect locations pre-verified):
1. **Dashboard needs-action headings** — `mockup-app/src/screens/dashboard-needs-action.ts:36,41`: "Review the details" = `REASON_VERB.needs_review`; "Review case" = the null-reason trailing group. Replace with distinct action verbs (recommended: `needs_review` → **"Check flagged details"**; null-group → **"Progress the case"**); constraint: no two group verbs share a leading word, each names its condition, style `<verb> — <count>` per binding review 010726 D7. No review mandates the current strings (verified). Record the change in a **new dated binding review entry** `docs/reviews/<DDMMYY>/decisions.md`.
2. **123-vs-124 count mismatch** — pipeline `statusToStage` excludes `new_email/ingested` from NOT READY while queue `filterQueue('not-ready')` includes them (`api/src/functions/dashboard.ts:143–163` vs `:73–78`; `packages/domain/src/model/queues.ts:122–141` vs `:54–72`). Single-source per TKT-012 contract + build **TKT-026**: same number everywhere a queue is named (recommended: pipeline NOT READY card shows the queue number with an "incl. N new" sub-line, or NEW folds visually into the same card; both deep-link `/queue/not-ready` already).
3. **Inbox "…" clipped** — `mockup-app/src/screens/Inbox.tsx:285` (`overflow:hidden`), `:510–516` (flex-end anchoring), `:920` (actions column 116px vs 4×32px hover cluster = 128px), worse with preview pane (`:303–305` 55% width). Fix: widen/auto-size actions column, cap hover cluster to 2 quick actions + overflow, ensure no clip with preview open.
4. **Inspection shortlist (TKT-062)** — `api/src/functions/inspection.ts:38–66` returns ALL `suggested%` rows (no LIMIT; provider-scope falls back to ALL when empty); SPA renders every row (`CaseDetail.tsx:1815`). Fix server-side: rank (case-postcode outward-code match > provider-scoped [`repairer_id`/`provider=` note token] > `suggestion_rank` > `suggestion_frequency` > `last_seen_on`) + `LIMIT ~8`; replace empty-scope→ALL fallback with labelled top-N global. Client: shortlist + "Search all locations…" typeahead expansion. Pure string ranking — no runtime matcher (ADR-0013), uses ADR-0016 metadata already in schema (`040_inspection_address.sql:27–29`).
5. **Twin collapse** — dashboard needs-action lists every open case; same-VRM twins render identical rows. Collapse with a count chip ("2 open cases for this VRM") linking to merge (reuse `openVrmTwins`, `rest-client.ts:251–254`).
6. **TKT-048** image previews (investigate + fix per authored ticket); **TKT-024** image-based new-case form variant (stretch, only if time after core).
7. **Terminology audit**: intake-channel labels (retro/provider_api), status labels, empty states per reviews 010726 D15 / 020726 E9.

Verification (the "UI is actually CLEAN" mandate):
- **Full browser sweep after P3V** (claude-in-chrome on the deployed SPA with rebuilt data; agents verify, screenshots as evidence): all 11 routes + drawers/dialogs × {console errors, visual cleanliness incl. clipping/overlap at 1024px+, functional controls, terminology, loading/empty/error states}. **Safety: never submit the remove-case dialog** (Fluent dialog, typed-confirmation — open/cancel only); no destructive clicks; live inbox untouched (UI "dismiss" writes DB triage state only — allowed).
- **accessibility-engineer**: contrast, focus, keyboard nav on changed screens. **design-critic**: adversarial before/after scoring; findings loop until clean.
- Deploy SWA (`npx @azure/static-web-apps-cli deploy` pattern from repo history); verify CSP header intact.

## P5 — AI chat helper (TKT-060; Opus builds; parallel track)

Chat-style helper ("like Claude in Chrome") — **read-only Q&A MVP**, distinct from TKT-015's suggestion layer:
- **Backend**: new Data API route `POST /api/assistant/chat` — streamed chunked response via fetch-reader (EventSource can't carry the MSAL Bearer; CSP already allows the API origin in `connect-src` — verified `staticwebapp.config.json:4`). Calls the **existing AOAI gpt-5 deployment** (`digital-3339-resource`, GlobalStandard) keyless — **grant api-app MI `Cognitive Services OpenAI User`** (mirror of the orch grant; azure:azure-rbac skill; note GlobalStandard = inference may process outside UK, already accepted for EMAIL_AI — record in doc).
- **Tools (strictly read-only)**: case lookup (PO/VRM/claimant), case summary, queue counts, inbound email search (DB only), plus a curated system prompt from CONTEXT.md glossary + status machine + process docs so it answers "how do I / what does X mean / where is case Y" questions. **No write tools, no actions** — refuses mutations.
- **Safety/ops**: RLS-scoped as staff (`app.role=staff` same as all API routes); gated **`AI_CHAT_ENABLED`** default OFF; audit_event per exchange (new choice code; log lengths + tool calls, not full transcripts); rate-limit per principal.
- **SPA**: global drawer from AppShell header (Sparkles icon consistent with `AiAssistPanel`), Fluent v9 + Griffel matching conventions (GLOBAL_TOASTER, EmptyState, Skeletons), streaming text render, suggested prompts. a11y + browser-sweep coverage like any screen.
- **Flip** `AI_CHAT_ENABLED=true` (api) after smoke; document in LIVE_FACTS + registry.

## P6 — Box webhook + sandboxed E2E + mirror audit (box-integration-architect guidance; after P3V)

1. **Create FILE.UPLOADED webhook** via our facade `POST box/webhooks` (route exists — `function_app.py:342`) targeting root `392761581105` → `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook`; verify via `GET box/webhooks/{id}`; record id in LIVE_FACTS. (Closes the subscription half of D2; the **File Request template remains operator** — needs Box-UI hand-build; document exact steps + `BOX_FILE_REQUEST_TEMPLATE_ID` wiring.)
2. **E2E**: pick a rebuilt case with a Box folder → upload a test image via facade → FILE.UPLOADED fires → box-webhook validates signature → evidence row registered via Data API → `box_upload_received` audit → status re-eval → SPA shows the image. Assert each hop (App Insights + DB + SPA screenshot). Clean up test uploads after.
3. **Mirror audit** (read-only): every `case_.box_folder_id` exists, folder name == `case_po`, folder contents ↔ evidence rows; root contains only live-case folders + `_pre-replay-*` holding.
4. Also verify the orchestration-side archive path on a replayed case (.eml + attachments present in folder — TKT-003 class).

## P7 — Ops hardening (Sonnet for mechanical, Opus for auth; auth-plane items strictly after P3V)

- **Subscription prune step** in `runSubscriptionMaintenance` (delete subs for mailboxes no longer in `GRAPH_INTAKE_MAILBOXES` — the digital@ manual-delete gap).
- **Durable auth error-handling + token `aud` audience-form hardening** (finish the in-progress rung).
- `EVIDENCE_BLOB_CONNECTION` → managed identity; **orch-MI app-role on the Data API**; **blob soft-delete/versioning** on `cespkevidstdev01` (E1); **parser key rotation** (D5) + update orch setting.
- graph-webhook 499/cold-start assessment (KQL; decide always-ready-instance recommendation with cost note — operator decision).
- Each change: LIVE_FACTS bump + `VERIFY_LIVE=1 node verify-all.mjs`.

## P8 — Go-live documentation + readiness + reconciliation (Opus writes; adversarial review)

- **`docs/plans/go-live/`**: `runbook.md` (ordered cutover: PAYG → staff roles → provider corpus completion → Case/PO floor seeding from archive listing + placeholder renumber [existing `docs/plans/case-po-sequence-cutover.md` referenced] → archive roots + retro gate flips → File Request template + gate → EVA drag-drop live procedure → day-0 smoke → rollback plan), `readiness-matrix.md` (every gate × value × meaning × go-live target × owner), `day0-smoke.md`, `rollback.md`, `support-playbook.md` (on-call: common failures → KQL → fix), consolidated **operator checklist** with exact commands/portal paths for every operator item above.
- **Docs/board reconciliation**: ROADMAP, CURRENT_STATUS, gated.md, BOARD.md, LIVE_FACTS + live-environment mirror, ticket statuses (incl. frontmatter/board drift on TKT-023/041/043/046), CONTEXT.md glossary additions, the new binding review entry. Gates: `check-doc-links.mjs`, `check-tickets.mjs`, `verify-all.mjs` all green.
- **Final adversarial completeness review** (workflow): "what would break on go-live day that this sprint didn't cover?" — findings become fix-or-document items. Commit throughout with conventional messages.

---

## Workflow orchestration guidance (for the executing Opus)

- Run each phase as its own **Workflow invocation** (the operator has opted into multi-agent orchestration for this sprint); stay in the loop between phases; verify gates before advancing.
- **Fan-out on Sonnet**: P1 corpus shards (mailbox × time-slice), P3V checks (one agent per check family, one per ticket), P4 browser sweep (one agent per screen) + adversarial verify of every "clean" verdict, P8 doc-consistency checks. **Opus**: pager/driver build, wipe delta authoring, classifier changes, AI chat build, adjudication.
- **Platform routing** (state the choice per task): az/func/psql/pg_dump/KQL → **WSL**; node/npm/esbuild/git/Box CLI → **Windows**; Exchange admin → **Windows PowerShell**. Two-strikes doctrine: same Azure op fails twice → matching `azure:*` skill or microsoft-docs before a third try.
- **Discipline**: LIVE_FACTS.json + mirror updated after every live change (bump lastVerified); commit as work progresses; PII exports stay local/gitignored; nothing mutates the real Box archive or mailbox contents, ever.

## Definition of done

1. Replay complete: manifest reconciles 100%; consistency gates pass; misclass/probe ticket cluster closed with evidence; data on screen is correct per current logic.
2. UI verified CLEAN by agents (browser sweep evidence pack + a11y + design-critic sign-off); the two dashboard headings unambiguous; counts agree everywhere; inbox overflow visible; inspection picker shows a ranked shortlist.
3. AI chat helper live behind `AI_CHAT_ENABLED=true`, read-only, audited.
4. Box: CLI installed+authed; FILE.UPLOADED webhook live + E2E proven (upload→webhook→evidence→SPA); mirror audit clean; File-Request template documented for operator.
5. Ops: prune step, auth hardening, MI storage auth, blob hardening, alerts — deployed and verified.
6. `docs/plans/go-live/` complete; readiness matrix names every remaining operator action with exact instructions; all offline gates green; BOARD/docs reconciled.
