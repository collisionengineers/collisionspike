# Board — ticket tracker

> Kanban mirror of every ticket under [docs/tickets/](./README.md). One row per ticket; the column =
> the ticket's `status` frontmatter. Each ticket lives in its own folder with a `changes.md` +
> `verification.md` audit trail (see the [README](./README.md)). Keep this table in sync when you change a
> ticket's status. The [`scripts/check-tickets.mjs`](../../scripts/check-tickets.mjs) checker validates the
> frontmatter (not the board placement — moving a row is a manual edit).
>
> **No live numbers here** — see the registry [live-environment.md](../architecture/live-environment.md)
> ([`LIVE_FACTS.json`](../../LIVE_FACTS.json)).
>
> **Truth standard.** `done` = the fix is LIVE and proven (test or live probe), recorded in that ticket's
> `verification.md`, with no known gap. Code that is written/merged but **not confirmed working in the live
> app** stays `now` — "code-correct" is not "done".
>
> **Reconciled 2026-07-05 (go-live sprint)** — P4/P5/P6/P7 landed. Moved **TKT-048/060/061/062/063** to
> **done**: inline evidence-image previews live (same-origin `GET /api/evidence/{id}/content`); the read-only
> AI chat helper live (`AI_CHAT_ENABLED=true`, count tool fixed to the queue numbers); the Box `FILE.UPLOADED`
> webhook subscribed + E2E proven (File-Request template id stays operator); the ranked inspection-address
> shortlist live; the go-live runbook/readiness-matrix/operator-checklist authored. Filed **TKT-064**
> (image-classification gap — evidence-image role + registration-visible detection unbuilt). **TKT-059**
> wipe-and-rebuild is **superseded** (the mailboxes don't retain full history; the deployed classifier proved
> sound) — its P1 replay driver shipped **dark** (`REPLAY_BACKFILL_ENABLED=false`), so the row stays `now`.
> Also single-sourced the queue count (**TKT-026** → done; dashboard "NOT READY" == Queues "Not ready",
> live 125==125).
>
> **Reconciled 2026-07-03 (second wave)** — the rules-engine-v2 activation: D7 (taxonomy DDL) + D8
> (identification seed) + the Phase-4 `ai_suggestion.embedding` delta are **all applied live**; the parser
> is **redeployed** (3 functions, taxonomy-v2 engine + the 2026-07-03 classifier hardening); all four
> `TRIAGE_*` gates are **`true`** on `cespk-orch-dev` — the triage policy is **ACTING**, not shadow-only.
> Moved **TKT-023/041/043/046** from `next` to `now` (their taxonomy-v2 gated behaviours are now live and
> acting — TKT-041's hold-language edge case still needs an operator taxonomy decision, kept as a note).
> Updated **TKT-021/051** (Connexus/PCH intermediary) to reflect the D8 seed data now landed — both stay
> `now`, awaiting a live-occurrence probe. Activation order `docs/gated.md` **§D7 → parser deploy → §D8 →
> TRIAGE_\* flips** is now **complete**; only **§D6 items 4/5** (PII export, Foundry keyless flip) remain
> open.
>
> Prior: **2026-07-03 (nine-task activation)** — TKT-055 moved from "built, not deployed"
> to **deployed live** (delta applied, routes live, 401 smoke passed; first-key mint + e2e submit still
> pending the operator — row updated, stays `now`); TKT-054's row updated to reflect the
> `OUTLOOK_MOVE_ENABLED` gate flip (Exchange grant + operator live test still pending, gated.md B4). No
> ticket changed column. Prior: **2026-07-02** — rules-engine-v2 **build** pass (the six-phase build completed this
> session; see [the build checklist](../plans/phase-8-inbox-management/rules-engine-v2-build.md)): moved
> **7** misclassification-cluster tickets to **done** (TKT-029/030/033/036/037/038/040 — live-probed
> against the deployed classifier and locked by an eval-corpus regression pin); moved **7** tickets to
> **now** (TKT-021/025/028/031/039/047/051 — code or data deployed, or eval-passing, with a live probe or
> an operator seed/gate apply still pending); moved **4** tickets to **next** (TKT-023/041/043/046 —
> built but gated OFF behind the D7 DDL delta + per-behaviour `TRIAGE_*` flips). Refreshed TKT-005
> (already `now`) and TKT-015 (already `next` — Phase 4 wired ONE concrete lane, email-triage
> categorisation, to a real AOAI call, still gated OFF). Activation order: `docs/gated.md`
> **§D7 → parser deploy → §D8 → TRIAGE_* flips → §D6+G5** (EMAIL_AI). Left unchanged: TKT-034 (backlog —
> the reg-keyed Box dumping-folder lane is still a stubbed TODO), TKT-032 (blocked), TKT-035 (backlog —
> needs an operator-supplied sample), TKT-052 (backlog). Prior: rules-engine-v2 **review** pass — authored
> + boarded the previously frontmatter-less drop-notes **TKT-041/043/044/046/047/051** and split
> **TKT-052** (merge provider-loss) out of the old `TKT-041-merge-fix` folder. Earlier: 2026-07-01 —
> TKT-049/050 **VERIFIED-LIVE** (AX claimant-email blank + circumstances boundary fix, parser
> redeployed); TKT-003 **VERIFIED-LIVE** (operator re-test post-regression fix).

## Now — in flight / not yet confirmed live

| ID | Title | Why not done (evidence) |
|---|---|---|
| [TKT-054](./TKT-054-ui-work/TKT-054-ui-work.md) | Inbox simplification + VRM/Ref split + dashboard inbox-panel regressions | DEPLOYED 2026-07-02 (orch / api / SPA; mailbox chips live-verified reading info@/engineers@/desk@ post-backfill; legacy deep-links rewrite; dashboard tiles aligned). `OUTLOOK_MOVE_ENABLED` **flipped true 2026-07-03** (user-instructed) — the SPA "File to …" buttons are live, but Graph moves still 403 pending the operator's Exchange `Mail.ReadWrite` grant ([gated.md B4](../gated.md), steps 1–2). Remaining: operator click-through + that grant + the operator's own live move test. Rulings: [020726 review](../reviews/020726/decisions.md) (supersedes 010726 D16). See [verification](./TKT-054-ui-work/verification.md). |
| [TKT-001](./TKT-001-document-parsing/TKT-001-document-parsing.md) | Multi-format extraction + field-drop fix | Follow-up deployed 2026-07-01 (parser live-proven on triage `.eml`; body supplement deployed). Pending: e2e re-intake Postgres proof on triage `.doc` path. See [changes-regression-01-07-26](./TKT-001-document-parsing/changes-regression-01-07-26.md). |
| [TKT-005](./TKT-005-email-actions/TKT-005-email-actions.md) | Make the inbox actionable (dismiss removes from view) | CODE-COMPLETE, not confirmed live — shipped in the SPA bundle but the e2e pass exercised the data pipeline, not the UI. Needs a live SPA click-through (inbound_email rows now exist post-reset). See [verification](./TKT-005-email-actions/verification.md). |
| [TKT-027](./TKT-027-intake-triage-status/TKT-027-intake-triage-status.md) | Intermediate intake status beyond "new" | DEPLOYED — api+orch live; intake `ingested` audit proof pending next email. See [verification](./TKT-027-intake-triage-status/verification.md). |
| [TKT-021](./TKT-021-connexus-intermediary/TKT-021-connexus-intermediary.md) | Resolve Connexus → real provider (PCH/SBL) | Image-Source intermediary resolution code DEPLOYED live 2026-07-02; the D8 seed delta (Connexus → PCH/SBL) is **applied live 2026-07-03** — the data is now live. Awaiting a live-occurrence probe to close. See [verification](./TKT-021-connexus-intermediary/verification.md). |
| [TKT-025](./TKT-025-inbox-source-filter/TKT-025-inbox-source-filter.md) | Mark + filter inbox by source mailbox | DEPLOYED live in the SPA bundle 2026-07-02 (toolbar mailbox-chip filter). Needs a live click-through. See [verification](./TKT-025-inbox-source-filter/verification.md). |
| [TKT-028](./TKT-028-work-provider-not-populating/TKT-028-work-provider-not-populating.md) | `work_provider` not populating on intake | The operator's own example already worked via domain match (confirmed 2026-06-30); a content-string mapping DEPLOYED 2026-07-02 as a second signal, awaiting live proof. See [verification](./TKT-028-work-provider-not-populating/verification.md). |
| [TKT-031](./TKT-031-misclass-client-chasing/TKT-031-misclass-client-chasing.md) | Client report-chaser misrouted to 'Other' | Eval-passing on the deployed engine (committed corpus, 2026-07-02); awaiting a live occurrence/probe to close. See [verification](./TKT-031-misclass-client-chasing/verification.md). |
| [TKT-039](./TKT-039-misclass-query-report-support/TKT-039-misclass-query-report-support.md) | Report-support request misclassified as new case | Eval-passing on the deployed engine (committed corpus, 2026-07-02); awaiting a live occurrence/probe to close. See [verification](./TKT-039-misclass-query-report-support/verification.md). |
| [TKT-047](./TKT-047-email-sigs-box/TKT-047-email-sigs-box.md) | Email signature images archived to Box in error | Non-inline raster floor DEPLOYED live on orch 2026-07-02; awaiting live proof on a real signature-bearing email. |
| [TKT-051](./TKT-051-pch-connexus/TKT-051-pch-connexus.md) | PCH not identified (doc-content name + @pch-ltd.com senders) | Identification-mapping code DEPLOYED live 2026-07-02 (doc-content "PCH" now maps to a `work_provider_id`); the `@pch-ltd.com` domain addition (D8 seed delta) is **applied live 2026-07-03** — both signals now live. The operator-reported "EVA (Engineers)" mislabel on these emails is root-caused + fixed under **TKT-056**, **deployed live 2026-07-04** (engine-v2.6 fallback suppression + the API denylist; §D9 proved the corpus never held an EVA row — the leak was code-only). Awaiting a live-occurrence probe to close. |
| [TKT-056](./TKT-056-audit-case-type-activation/TKT-056-audit-case-type-activation.md) | Audit case-type end-to-end — EVA-leak fix + A./AP./D. markers + engineer_report evidence ([ADR-0021](../adr/0021-case-po-marker-taxonomy.md)) | **ACTIVATED LIVE 2026-07-04** (user-instructed go-live): D9 applied (a verified no-op — the corpus never held an EVA row) + D10 applied; api/orch/parser/SPA deployed at `aafeba1` (77/53/3 re-verified); **`AUDIT_CASES_ENABLED=true` on both apps** (shadow window waived by the user). Only the step-6 **live probe** (next real audit email) remains. See [verification](./TKT-056-audit-case-type-activation/verification.md). |
| [TKT-055](./TKT-055-provider-api-intake/TKT-055-provider-api-intake.md) | Provider API intake channel (machine-to-machine case lodging) | DEPLOYED live 2026-07-03 (nine-task activation): the `2026-07-03-provider-api-intake` delta is applied (`provider_api_key` table, RLS + policies, audit codes, `choice_intake_channel_kind`), the api routes (`createProviderApiKey`/`listProviderApiKeys`/`revokeProviderApiKey`, `providerIntakeCase`) are live, and the no-key/bad-key **401** fail-closed smoke passed. Still pending (operator): a Superuser mints the first key in Admin + an end-to-end `POST /api/provider-intake/cases` submit smoke. Design [ADR-0020](../adr/0020-provider-api-intake-channel.md); contract [spec](../reference/provider-api-intake-spec.md). See [verification](./TKT-055-provider-api-intake/verification.md). |
| [TKT-023](./TKT-023-follow-up-docs/TKT-023-follow-up-docs.md) | Link follow-up docs/emails to the existing case + Box | Generalised ref-gate **ACTING live 2026-07-03** (`TRIAGE_REF_GATE_ENABLED=true` on `cespk-orch-dev`, D7 DDL applied) — awaiting a live-occurrence probe to close. See [verification](./TKT-023-follow-up-docs/verification.md). |
| [TKT-041](./TKT-041-cancelled-case/TKT-041-cancelled-case.md) | Cancelled/closed-case emails have no home (no cancellation concept) | `cancellation` taxonomy + engine **ACTING live 2026-07-03** (`TRIAGE_CANCELLATION_ENABLED=true`, D7 DDL applied; eval-proven 12/13 recall) — awaiting a live-occurrence probe. The 13th case is a flagged **hold-language taxonomy gap that still needs an operator decision**. |
| [TKT-043](./TKT-043-misclass-images-received/TKT-043-misclass-images-received.md) | Images-received / report-chaser email misrouted (scope to confirm) | `case_update`/`images_received` taxonomy + policy **ACTING live 2026-07-03** (`TRIAGE_IMAGES_ROUTING_ENABLED=true`, D7 DDL applied) — this ticket's own sample still misses even in the eval corpus, so it needs a follow-up fix pass, not just the gate flip. |
| [TKT-046](./TKT-046-seperate-case-updates/TKT-046-seperate-case-updates.md) | Separate case updates from general queries (own lane + attach-to-case) | `case_update` vs `query_existing_work` precedence **ACTING live 2026-07-03** (`TRIAGE_CASE_UPDATE_ENABLED=true`, D7 DDL applied) — awaiting a live-occurrence probe to close. |
| [TKT-058](./TKT-058-retro-case-creation/TKT-058-retro-case-creation.md) | Retroactive case creation — reconstruction fallback for un-linked update/billing email ([ADR-0022](../adr/0022-retroactive-case-reconstruction.md)) | **R1–R4 BUILT; ACTIVATED 2026-07-04 (rung 1)**: delta applied live, all four surfaces deployed at `d91c185`, `RETRO_CASE_ENABLED=true` both apps — **any-status linking is ACTING** (billing email → its case, terminals included); both new routes 401 fail-closed. Box rung DARK pending [gated.md D11](../gated.md): archive root ids + Viewer grant **+ the Case/PO sequence-alignment fix** (operator-raised: live mint restarted ~001 post-reset vs the far-ahead real archive — floor mechanism is the named next build). Outlook rung DARK (`RETRO_OUTLOOK_SEARCH_ENABLED` unset). Awaiting a live-occurrence probe on a real billing email. See [verification](./TKT-058-retro-case-creation/verification.md). |
| [TKT-059](./TKT-059-replay-wipe-rebuild/TKT-059-replay-wipe-rebuild.md) | Replay: wipe & rebuild derived data from full mailbox history | WIPE & REBUILD **NOT executed — superseded** (2026-07-05). Finding: the live mailboxes do **not** retain full ingested history (dry-run collected only 88 of 390), so a wipe+replay would have destroyed ~150 cases it could not rebuild; and an eval proved the deployed classifier is sound (~94% `receiving_work` recall), so the existing data is largely correct — reprocessing is **optional**, not needed for go-live. The P1 driver (`listMessagesSince` pager + keyed `POST /api/replay-backfill` Durable driver + replay-manifest lib) is **BUILT, deployed, and shipped DARK** (`REPLAY_BACKFILL_ENABLED=false` on `cespk-orch-dev`). Stays `now` (driver shipped dark; the wipe path is abandoned). |

## Done — live & verified

| ID | Title | Verified by ([per-ticket verification.md]) |
|---|---|---|
| [TKT-002](./TKT-002-pdf-image-extraction/TKT-002-pdf-image-extraction.md) | Auto-extract vehicle images + flag unsuitable | **VERIFIED-LIVE** (extraction) — 63 image rows = telemetry `extracted:63`. Unsuitable-flag half awaits `PLATE_OCR_ENABLED`. |
| [TKT-003](./TKT-003-box-sync/TKT-003-box-sync.md) | Get `.eml` / images / instructions into the Box folder | **VERIFIED-LIVE** (2026-07-01) — post-regression re-test: intake archive copies `.eml` + instructions (+ images) into case folder; `boxArchiveEvidence` clean. |
| [TKT-006](./TKT-006-suggested-tags-and-folders/TKT-006-suggested-tags-and-folders.md) | Suggest email categories/tags | **VERIFIED-LIVE** (tags) — `suggested_category/subtype` populated on both live cases. Outlook-folder-sort half deferred (Phase 2). |
| [TKT-007](./TKT-007-amalgamated-dashboard/TKT-007-amalgamated-dashboard.md) | Combine email + intake overviews into one dashboard | TESTED (offline) — `dashboard.test.ts` 10/10. |
| [TKT-008](./TKT-008-calendar-date-fields/TKT-008-calendar-date-fields.md) | Calendar picker on the date fields | TESTED (offline) — `date-format.test.ts` 12/12; SPA build PASS. |
| [TKT-009](./TKT-009-clickable-case-and-email/TKT-009-clickable-case-and-email.md) | Clickable associated emails + view-full-email | **VERIFIED-LIVE** (data linkage) — both `inbound_email` rows carry `case_id`; `QDOS26001` has `work_provider_id`. |
| [TKT-011](./TKT-011-case-page/TKT-011-case-page.md) | Case page de-jargon + layout | TESTED (offline)/audit — plain-language sweep clean. |
| [TKT-012](./TKT-012-dashboard-logic/TKT-012-dashboard-logic.md) | Combined dashboard/queue count contract | TESTED (offline) — `dashboard.test.ts` 10/10 + `mappers.test.ts`. |
| [TKT-013](./TKT-013-automation-mode/TKT-013-automation-mode.md) | Per-provider automation modes | **VERIFIED-LIVE** — orch trace shows the mode-branch executing; live providers flipped review_auto. |
| [TKT-014](./TKT-014-acme-placeholder/TKT-014-acme-placeholder.md) | Remove the `acme.co.uk` placeholder | TESTED (offline)/audit — zero `acme` in source. |
| [TKT-019](./TKT-019-ticket-system/TKT-019-ticket-system.md) | Markdown ticket system + board + validator | TESTED (offline) — `check-tickets.mjs` 0 errors (now 40 tickets in per-ticket folders). |
| [TKT-020](./TKT-020-docs-cleanup/TKT-020-docs-cleanup.md) | Stale-plan cleanup + root-doc reconciliation | TESTED (offline) — `check-doc-links.mjs` PASS. |
| [TKT-049](./TKT-049-incorrect-claimant-email/TKT-049-incorrect-claimant-email.md) | Claimant email wrongly set to AX team inbox | **VERIFIED-LIVE** (2026-07-01) — live `/api/parse` on AX sample: `claimant_email` blank (team inbox rejected). |
| [TKT-050](./TKT-050-ax-pdf-extract/TKT-050-ax-pdf-extract.md) | AX PDF accident circumstances extraction too deep | **VERIFIED-LIVE** (2026-07-01) — live `/api/parse` on AX sample: circumstances narrative only, no Pre Existing tail. |
| [TKT-029](./TKT-029-misclass-case-summary/TKT-029-misclass-case-summary.md) | Case-summary email misclassified as new case | **VERIFIED-LIVE** (2026-07-02) — live-probed against the deployed classifier (`non_actionable`/`case_summary`); locked by an eval-corpus regression pin. |
| [TKT-030](./TKT-030-misclass-chasing-report/TKT-030-misclass-chasing-report.md) | Report-chaser misclassified as new work | **VERIFIED-LIVE** (2026-07-02) — live-probed against the deployed classifier (`query`/`query_existing_work`); locked by an eval-corpus regression pin. |
| [TKT-033](./TKT-033-misclass-email-reply/TKT-033-misclass-email-reply.md) | Simple reply to our query misclassified as new work | **VERIFIED-LIVE** (2026-07-02) — live-probed against the deployed classifier (`query`/`query_existing_work`); locked by an eval-corpus regression pin. |
| [TKT-036](./TKT-036-misclass-instructions/TKT-036-misclass-instructions.md) | Work-instructions email misclassified as query | **VERIFIED-LIVE** (2026-07-02) — live-probed against the deployed classifier (`receiving_work`/`new_client_work`); locked by an eval-corpus regression pin. |
| [TKT-037](./TKT-037-misclass-invoice-request/TKT-037-misclass-invoice-request.md) | Invoice request misclassified as new case | **VERIFIED-LIVE** (2026-07-02) — live-probed against the deployed classifier (`billing`/`billing_request`); locked by an eval-corpus regression pin. |
| [TKT-038](./TKT-038-misclass-query-ack/TKT-038-misclass-query-ack.md) | Bare acknowledgement ('Thanks Ed') misclassified as query | **VERIFIED-LIVE** (2026-07-02) — live-probed against the deployed classifier (`non_actionable`/`acknowledgement`); locked by an eval-corpus regression pin. |
| [TKT-040](./TKT-040-misclass-roadworthy-request/TKT-040-misclass-roadworthy-request.md) | Informal roadworthy work-request misrouted to 'Other' | **VERIFIED-LIVE** (2026-07-02) — live-probed against the deployed classifier (`receiving_work`/`existing_provider_instruction`); locked by an eval-corpus regression pin. |
| [TKT-026](./TKT-026-queue-tracking/TKT-026-queue-tracking.md) | Queue counts don't match the actual queues | **VERIFIED-LIVE** (2026-07-05) — the P4 fix single-sourced the count: the dashboard pipeline "NOT READY" now equals the Queues "Not ready" count everywhere (live 125==125), folding the redundant NEW segment in. |
| [TKT-048](./TKT-048-no-image-previews/TKT-048-no-image-previews.md) | Inbox/case image previews not rendering | **VERIFIED-LIVE** (2026-07-05) — real inline previews live; new `GET /api/evidence/{id}/content` serves bytes same-origin (blob first, Box-facade fallback for the ~39% box-only evidence); the SPA fetches with bearer → `blob:` URL for `<img>`. Proven end-to-end on case `85fedca4` (box-only image → 200 image/jpeg → `<img>` 1200×1600). |
| [TKT-060](./TKT-060-ai-chat-helper/TKT-060-ai-chat-helper.md) | AI chat helper — read-only Q&A assistant drawer | **VERIFIED-LIVE** (2026-07-05) — built + deployed; `AI_CHAT_ENABLED=true` on `cespk-api-dev`; `POST /api/assistant/chat` answers with real data via read-only tools; the count tool was fixed to return QUEUE counts matching the dashboard (Not ready 125, Held 40), verified live by direct endpoint call. Read-only, audited, keyless AOAI `gpt-5`. |
| [TKT-061](./TKT-061-box-cli-webhook-e2e/TKT-061-box-cli-webhook-e2e.md) | Box CLI + FILE.UPLOADED webhook + sandboxed E2E | **VERIFIED-LIVE** (2026-07-05) — Box CLI installed + authed on Windows; `FILE.UPLOADED` webhook SUBSCRIBED on root `392761581105` → the `box-webhook` fn; E2E proven (upload → `FILE.UPLOADED` → signature validate → evidence row → audit → SPA). **REMAINDER (operator):** the template File Request id (`BOX_FILE_REQUEST_TEMPLATE_ID`) still needs a Box-UI hand-build — the CLI + webhook + E2E core is done. |
| [TKT-062](./TKT-062-inspection-shortlist/TKT-062-inspection-shortlist.md) | Inspection-address picker returns entire corpus — add ranked shortlist | **VERIFIED-LIVE** (2026-07-05) — deployed + verified: the Address tab shows a ranked ~4-item shortlist + a "Search all locations…" corpus search; no more full-corpus dump. |
| [TKT-063](./TKT-063-go-live-docs/TKT-063-go-live-docs.md) | Go-live runbook, readiness matrix & operator checklist | DONE (2026-07-05) — authored `docs/plans/go-live/` (README, runbook, readiness-matrix, day0-smoke, rollback, support-playbook, operator-checklist), linked from `docs/plans/README.md`. |

## Next — queued / MVP

| ID | Title | State |
|---|---|---|
| [TKT-015](./TKT-015-ai-assistant/TKT-015-ai-assistant.md) | AI suggestion layer (gated) | Phase 4 of [rules-engine-v2](../plans/rules_engine_v2_plan_9ba034c4.plan.md) wired ONE concrete lane (email-triage categorisation) to a real, keyless AOAI call 2026-07-02 — `EMAIL_AI_ENABLED` **flipped live 2026-07-03** (user-instructed; `AI_ASSIST_ENABLED` still absent); the case/damage-assessment + image/reg-OCR consumers remain unbuilt. See [verification](./TKT-015-ai-assistant/verification.md). |
| [TKT-016](./TKT-016-ai-image-analysis/TKT-016-ai-image-analysis.md) | Image-analysis VLM sequence | Research-only; pipeline unbuilt. |
| [TKT-017](./TKT-017-ai-reg-ocr/TKT-017-ai-reg-ocr.md) | Registration-recognition model bench | Research-only; no benchmark run. |
## Backlog — not started

| ID | Title | Source / note |
|---|---|---|
| [TKT-018](./TKT-018-ai-case-category/TKT-018-ai-case-category.md) | AI total-loss vs repairable categorisation | Deferred until the pipeline is complete. |
| [TKT-022](./TKT-022-docx-extraction-fail/TKT-022-docx-extraction-fail.md) | `.docx` claim-form extraction fails | Drop-note (P1): garbled fields on a Word claim form. |
| [TKT-024](./TKT-024-image-based-new-case/TKT-024-image-based-new-case.md) | Image-only new-case form | Drop-note: drop instruction-only fields. |
| [TKT-034](./TKT-034-images-received-routing/TKT-034-images-received-routing.md) | Inbound images: match to case / Box / flag | Misclass cluster (→ TKT-003/004). |
| [TKT-035](./TKT-035-misclass-information-request/TKT-035-misclass-information-request.md) | Information-request misclassification (placeholder) | Misclass cluster — **needs a sample email from the operator**. |
| [TKT-044](./TKT-044-mileage-calc-check/TKT-044-mileage-calc-check.md) | Mileage calculations look ~10,000 over expected values | Drop-note (authored 2026-07-02); enrichment MOT-estimate check — not part of rules-engine-v2. |
| [TKT-052](./TKT-052-merge-provider-loss/TKT-052-merge-provider-loss.md) | Merged image-only case loses the provider (merge logic) | Split from the old TKT-041-merge-fix folder (2026-07-02); TKT-028 territory. |
| [TKT-064](./TKT-064-image-classification/TKT-064-image-classification.md) | Auto-classify evidence images — role (overview/damage) + registration visible | P2, area pipeline (operator-raised 2026-07-05). Image role is unbuilt (deferred M2/ADR-0009, defaults `unknown`); registration OCR runs only on PDF-extracted images. Needs a vision-classifier pass + OCR-on-all-sources + backfill. |

## Blocked — needs operator

| ID | Needs |
|---|---|
| [TKT-004](./TKT-004-case-po-generation/TKT-004-case-po-generation.md) | The live/production Box root id for the allocator fallback (not the test folder). DB mint works (`QDOS26001`). |
| [TKT-010](./TKT-010-delete-case/TKT-010-delete-case.md) | Operator to assign `CollisionSpike.Superuser` to the staff principal (access-control change). Soft-remove + dialog coded; Box delete is ACK-only per ADR-0017. |
| [TKT-032](./TKT-032-misclass-defer-routing/TKT-032-misclass-defer-routing.md) | Operator routing decision for the deferred Audatex + PCD-diminution emails before the rule can be specified. |
| [TKT-057](./TKT-057-ap-diminution-refinement/TKT-057-ap-diminution-refinement.md) | A real inbound diminution instruction email (grounds `D.` detection) + a standalone a.qdos inbound email if one exists; then the SPA case-type control for the review-time AP. refinement ([ADR-0021](../adr/0021-case-po-marker-taxonomy.md)). Also gated behind TKT-056's activation ladder. |
