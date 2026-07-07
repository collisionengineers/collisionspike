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
> **Distilled 2026-07-07 (third wave — `to-distill/` re-drop → 12 tickets)** — filed **TKT-094…105**
> from the fresh `docs/tickets/to-distill/` drop. `PLAN-case-done-lifecycle.md` became a 3-ticket
> cluster (**TKT-094** `done` status model + auto-`eva_submitted` on export [anchor — holds the full
> plan], **TKT-095** `done` detectors, **TKT-096** Completed/Archive view + terminal-scope search
> fold-in). Standalone notes: **TKT-097** cancellation misclassified as a case query (relates TKT-041),
> **TKT-098** inbox pagination (15/page), **TKT-099** QCL Case/PO not minting, **TKT-100** QDOS false
> VRM "AND2", **TKT-101** QDOS two refs wrongly linked as one case, **TKT-102** Tractable received-email
> handling, **TKT-103** Tractable "768.00" wrong-reference bug, **TKT-104** Tractable API integration
> (blocked — vendor docs), **TKT-105** remittance advice → payments. The already-distilled re-drops were
> disregarded (their material already lives in the TKT-021…040 / 059…063 / 066…093 evidence folders);
> the drop-zone was removed. 11 → Backlog, 1 → Blocked (TKT-104).
>
> **Email misclassification batch LIVE 2026-07-07 (TKT-081/082/083/093)** — the four P1
> email-mistag tickets from the 2026-07-06 drop-notes are fixed. The **classifier fixes are
> LIVE + PROVEN** (parser redeployed; `POST /api/classify-email` confirms acks →
> `non_actionable/acknowledgement`, "your report" query → `query_existing_work`, body-only
> "New INSTRUCTIONS:" → `receiving_work`, forwarded "Audatex attached" → `case_update`). Plus an
> explicit tested `categoryMintsCase` mint guard (TKT-081), and TKT-093's **auto-attach** — built,
> deployed, then **FLIPPED LIVE** (`TRIAGE_AUTO_ATTACH_ENABLED=true` on `cespk-orch-dev`,
> operator-instructed; case_po/job_ref exact-single only — VRM-only stays a suggestion per
> ADR-0010/0019) + an inbox-list "may belong to · <Case/PO>" visibility hint. **parser + api + orch
> + SPA all deployed**; the classifier engine re-vendored to the sibling (`engine-v2.7`); the
> **TKT-081 blank-case was voided** (soft-remove, backup-first, audited; 0 active blank cases).
> **Remaining:** only the redundant full-intake live-occurrence observations (the classify layer is
> already live-proven). All four moved Backlog → `now`.
>
> **Inspection-address repair shipped 2026-07-06 (TKT-074…080)** — the whole 3-tier subsystem
> rebuilt + LIVE-reseeded + deployed. **TKT-074 → done** (box-scope hook fail-open fix, all 3 adapters).
> **TKT-075 → done** (reproducible in-repo corpus pipeline; live-validated reseed). **TKT-076/077/078/079/080
> → now** (DEPLOYED — api 82 / location fn (Oryx) / SPA; corpus reseeded live, backup-first + idempotent,
> confirmed rows byte-identical, firehose closed, QDOS/PCH now scoped). `AZURE_MAPS_KEY` **wired 2026-07-06**
> (KV ref on `cespk-api-dev`, geocode smoke passed → runtime proximity live). Remaining are operator live
> SPA click-throughs + `LOCATION_ASSIST_AI_ENABLED` sign-off. Full narrative:
> `LIVE_FACTS.json` `verifiedBy` (2026-07-06 inspection-address repair).
>
> **Distilled 2026-07-06 (second wave — `to-distill/` drop-notes → 13 tickets)** — filed
> **TKT-081…093** from the ten operator drop-note folders under `docs/tickets/to-distill/` (folder
> emptied + removed; all raw material moved into each ticket's `evidence/`). Four are a fresh
> email-mistag batch (**TKT-081** acknowledgement batch incl. a blank case opened, **TKT-082**
> existing-case query as new client work, **TKT-083** instructions left Unidentified despite
> detected signals, **TKT-084** pre-instruction lane design); the rest: **TKT-085** VRM logged as
> "OCTOBER" on A.PCH26003, **TKT-086** circumstances extraction gaps, **TKT-087** Box 409 upload
> conflicts, **TKT-088** image-role classification decision (blocked — operator), **TKT-089**
> non-vehicle images on Box, **TKT-090** RJS/UnknownVRM filename bug, **TKT-091** Outlook move
> fail (first filed blocked on the gated.md B4 grant; re-filed **backlog** the same day when the
> operator supplied the dev-tools evidence — the live failure is a **503** from the Data API's
> `outlook-move` route, not the expected 403), **TKT-092** PCH duplicate cases, **TKT-093**
> auto-attach matched emails. All carry the strict multi-class verification requirements; 12 →
> Backlog, 1 → Blocked (TKT-088).
>
> **Distilled 2026-07-06 (two operator plans → 15 tickets)** — filed **TKT-066…073** from
> `PLAN-assistant-intake-search-fixes.md` (assistant lookup normalization + tool-failure
> observability, New-chat button, user-confirmed evidence attach, six new read-only assistant
> tools, email-body readability, the HD4110 VRM false-positive rule + data fix, global search +
> same-VRM view, the varchar(16) overflow clamp) and **TKT-074…080** from
> `PLAN-inspection-address-repair.md` (the fail-closed shell-hook **P0 blocker**, the in-repo
> corpus rebuild pipeline, provider scoping + proximity ordering, photo-capable location assist,
> the gated AI vision escalation, address-picker polish, and the live reseed/deploy/verify
> cutover). All start in **Backlog**; each ticket folder carries its evidence + strict multi-class
> verification requirements (offline tests, gates, live probes, data/telemetry proof).
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
| [TKT-058](./TKT-058-retro-case-creation/TKT-058-retro-case-creation.md) | Retroactive case creation — reconstruction fallback for un-linked update/billing email ([ADR-0022](../adr/0022-retroactive-case-reconstruction.md)) | **R1–R4 BUILT; ACTIVATED 2026-07-04 (rung 1)**: delta applied live, all four surfaces deployed at `d91c185`, `RETRO_CASE_ENABLED=true` both apps — **any-status linking is ACTING** (billing email → its case, terminals included); both new routes 401 fail-closed. Box rung — archive root **supplied 2026-07-07**: `collision_engineers` = folder **4077648161** (Box CLI search), `BOX_READONLY_ROOT_IDS=4077648161` set read-only on the box-webhook fn. Still DARK on `RETRO_BOX_ARCHIVE_ROOT_IDS` (the R2 activation) pending [gated.md D11](../gated.md): confirm the service-account Viewer grant **+ the Case/PO sequence-alignment fix** (live mint restarted ~001 post-reset vs the far-ahead real archive — floor mechanism is the named next build). Outlook rung DARK (`RETRO_OUTLOOK_SEARCH_ENABLED` unset). Awaiting a live-occurrence probe on a real billing email. See [verification](./TKT-058-retro-case-creation/verification.md). |
| [TKT-065](./TKT-065-audit-provider-resolution/TKT-065-audit-provider-resolution.md) | Audit cases resolve NO work provider (leaked "EVA (Engineers)" masked a real bug) | Root-caused + **fixed + DEPLOYED live 2026-07-06** (orch 67 / api 82). The [[TKT-056]] fix only stopped the wrong label; it never recovered the right provider — `parse.ts` selected the audited EVA report and discarded the instruction's PCH/QDOS signal, starving the Data-API content-match. Fix: forward the provider resolved across ALL parsed docs (1a); never select an engineer-report layout as the instruction (1b); single-candidate intermediary fallback (1c). **Backfill applied live**: 20 mislabelled cases → 14 re-resolved to PCH, 6 connexus-only left blank/Held, all labels + provenance cleaned (`remaining_mislabelled=0`). Also renamed PCH → "Performance Car Hire". Awaiting a live audit-email probe (ties TKT-056 step-6); QDOS `known_email_domains` is the one open operator data item. See [ticket](./TKT-065-audit-provider-resolution/TKT-065-audit-provider-resolution.md). |
| [TKT-059](./TKT-059-replay-wipe-rebuild/TKT-059-replay-wipe-rebuild.md) | Replay: wipe & rebuild derived data from full mailbox history | WIPE & REBUILD **NOT executed — superseded** (2026-07-05). Finding: the live mailboxes do **not** retain full ingested history (dry-run collected only 88 of 390), so a wipe+replay would have destroyed ~150 cases it could not rebuild; and an eval proved the deployed classifier is sound (~94% `receiving_work` recall), so the existing data is largely correct — reprocessing is **optional**, not needed for go-live. The P1 driver (`listMessagesSince` pager + keyed `POST /api/replay-backfill` Durable driver + replay-manifest lib) is **BUILT, deployed, and shipped DARK** (`REPLAY_BACKFILL_ENABLED=false` on `cespk-orch-dev`). Stays `now` (driver shipped dark; the wipe path is abandoned). |
| [TKT-076](./TKT-076-inspection-provider-scope-proximity/TKT-076-inspection-provider-scope-proximity.md) | Inspection suggestions ignore the provider and distance — real scoping + nearest-first | **DEPLOYED + data-proven 2026-07-06** (api 82). Server-side `provider_code` scoping + the labelled fallback KILLED the `!s.providerCode` firehose; proximity ordering (`api/src/lib/maps.ts` haversine + `distanceMiles`) is **now live** — `AZURE_MAPS_KEY` wired on the api app as a versioned KV ref 2026-07-06 (geocode smoke passed: ML6 8TA, M12 4AH → real lat/lon), degrading honestly to frequency ordering when a case has no parseable postcode. Live smoke: QDOS/PCH now present, 0 suggested rows without a provider_code. Live SPA click-through pending (bearer-gated). See [verification](./TKT-076-inspection-provider-scope-proximity/verification.md). |
| [TKT-077](./TKT-077-location-assist-photos/TKT-077-location-assist-photos.md) | Location assist can't see the case photos — real photo bytes + signage business lookup | **DEPLOYED 2026-07-06** (loc fn + api + SPA). Proxy resolves evidence bytes inline (shared `evidence-bytes.ts`) → Python `InlinePhotoSource` (replaces the raising Box source under `BOX_API_ENABLED=true`); Maps fuzzy/POI for signage; CaseDetail auto-runs on corpus miss (suggest-only). Live E2E photo-path probe pending. `corpus_match` deferred (noted). See [verification](./TKT-077-location-assist-photos/verification.md). |
| [TKT-078](./TKT-078-location-assist-ai-escalation/TKT-078-location-assist-ai-escalation.md) | Deeper photo-based location suggestion — AI reasoning escalation (gated) | **FLIPPED LIVE 2026-07-07** (operator-instructed AI sign-off): `LOCATION_ASSIST_AI_ENABLED=true` on `cespkloc-fn-a7tzj2`, `AI_MODEL_ENDPOINT`/`gpt-5` wired, and the loc-fn MI granted **Cognitive Services OpenAI User** on `digital-3339-resource` (ARM PUT) so `build_reasoner()` mints a token → returns a reasoner. Was BUILT+DARK 2026-07-06 (`ai_reasoning.py`, keyless gpt-5 vision, `deep=true`, caps + telemetry). Remaining: a live `deep=true` probe on a real photo case. See [verification](./TKT-078-location-assist-ai-escalation/verification.md). |
| [TKT-079](./TKT-079-inspection-ui-provider-policy/TKT-079-inspection-ui-provider-policy.md) | Address picker polish — provider default chip, distance hints, show-more | **DEPLOYED 2026-07-06** (SPA). Provider `inspectionLocationPolicy` joined onto the Case → an `always_image_based` informational note (never auto-applied); "~N miles away" distance hint; show-more cap. Live click-through pending. See [verification](./TKT-079-inspection-ui-provider-policy/verification.md). |
| [TKT-080](./TKT-080-inspection-reseed-live/TKT-080-inspection-reseed-live.md) | Reseed the live address catalogue + deploy and prove the whole inspection repair | **RESEED DONE + PROVEN; api/SPA/fn DEPLOYED 2026-07-06.** DDL delta + `920` seed applied live (backup-first, idempotent×2): DELETE 2035 → INSERT 2012, confirmed rows byte-identical (md5 match). Smoke matrix passed; CSP re-verified. LIVE_FACTS + mirror + corpus doc + ADR-0016 + gated.md updated. `AZURE_MAPS_KEY` proximity wiring **done 2026-07-06** (KV ref, geocode smoke passed). Operator live SPA smoke remains. See [verification](./TKT-080-inspection-reseed-live/verification.md). |
| [TKT-081](./TKT-081-misclass-ack-batch/TKT-081-misclass-ack-batch.md) | Acknowledgement emails misclassified — one opened a blank case | **CLASSIFIER FIX LIVE + PROVEN 2026-07-07** (parser deployed; live `/classify-email` proves all 4 acks → `non_actionable/acknowledgement`, was query/new-case). Greeting/auto-reply/reaction-aware ack detection + a Rule-0 auto-ack branch; explicit tested `categoryMintsCase` mint guard (orch deployed). **Blank-case data fix DONE 2026-07-07** (the one pre-fix case voided — soft-remove, backup-first, audited; 0 active blank cases remain). Only a redundant full-intake live-occurrence probe remains. See [verification](./TKT-081-misclass-ack-batch/verification.md). |
| [TKT-082](./TKT-082-misclass-query-as-new-work/TKT-082-misclass-query-as-new-work.md) | Existing-case query misclassified as new client work | **CLASSIFIER FIX LIVE + PROVEN 2026-07-07** — a possessive "your report" about-existing signal suppresses the false `engineers report` work keyword → `query_existing_work` (was new_client_work); live-proven via `/classify-email`. Never reaches mint/dedup (fix is upstream). Live-occurrence probe + SPA click-through remain. See [verification](./TKT-082-misclass-query-as-new-work/verification.md). |
| [TKT-083](./TKT-083-misclass-instructions-unidentified/TKT-083-misclass-instructions-unidentified.md) | Instructions email left "Unidentified" despite detected signals | **CLASSIFIER FIX LIVE + PROVEN 2026-07-07** — relaxed Rule-3 floor (1 work phrase + VRM + ref, fresh non-query) → `receiving_work/new_client_work` (was `other`); live-proven. `fairwaylegal.co.uk` domain add is operator-reviewable. Live intake probe remains. See [verification](./TKT-083-misclass-instructions-unidentified/verification.md). |
| [TKT-093](./TKT-093-auto-attach-matched-emails/TKT-093-auto-attach-matched-emails.md) | Auto-attach matched emails + visibility + case_update misclass | **MISCLASS FIX LIVE + PROVEN 2026-07-07** (forward "Audatex attached" → `case_update`, was audit re-inspection). **Auto-attach BUILT + DEPLOYED, then FLIPPED LIVE 2026-07-07** (`TRIAGE_AUTO_ATTACH_ENABLED=true` on `cespk-orch-dev`, operator-instructed; case_po/job_ref exact-single only — VRM-only stays a suggestion per ADR-0010/0019). Inbox-list "may belong to · <Case/PO>" visibility built + **SPA DEPLOYED**. **Remaining:** the live E2E probe on the next real exact-match email. See [verification](./TKT-093-auto-attach-matched-emails/verification.md). |

## Done — live & verified

| ID | Title | Verified by ([per-ticket verification.md]) |
|---|---|---|
| [TKT-074](./TKT-074-shell-hook-fail-closed/TKT-074-shell-hook-fail-closed.md) | Every terminal command is blocked — the Box scope-guard hook fails closed | **RESOLVED (2026-07-06)** — the shared box-scope guard now resolves stdin on a 700ms timer (not the never-emitted `'end'`), lazy-imports its lib, and a 1500ms watchdog fail-OPENS for non-Box; hardened across `.cursor`/`.claude`/`.codex`. Proven: ~900ms with stdin held open; out-of-scope Box (folder 0 / bad id) still DENIED. See [verification](./TKT-074-shell-hook-fail-closed/verification.md). |
| [TKT-075](./TKT-075-inspection-corpus-pipeline/TKT-075-inspection-corpus-pipeline.md) | Rebuild the inspection-address corpus in-repo — correct provider attribution + geocodes | **BUILT + VALIDATED (2026-07-06)** — reproducible `scripts/inspection-corpus/` pipeline (marker-aware parse folds the 4673 `a.qdos…` IDs, hyphen/typo-tolerant image-based drop, PII-free 2012-site CSV + per-provider run report + geocache). Deterministic hash; DDL delta + `920` seed validated live in a rolled-back txn (live commit is TKT-080). See [verification](./TKT-075-inspection-corpus-pipeline/verification.md). |
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
| [TKT-107](./TKT-107-readonly-archive-assist/TKT-107-readonly-archive-assist.md) | Read-only Box archive assist (suggest-only) | P2 (operator-raised 2026-07-07): the `collision_engineers` archive (4077648161) is now readable (Viewer confirmed). Use it read-only — archive-match **suggestions**, assistant lookup, evidence reference — **without minting**, so it ships now despite the R2 reconstruction staying blocked on the Case/PO sequence-alignment (TKT-058/D11). No case creation, no allocator advance. |
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
| [TKT-066](./TKT-066-assistant-lookup-observability/TKT-066-assistant-lookup-observability.md) | Assistant can't find a case by spaced registration + tool failures are invisible | P1 (plan 2026-07-06 §1): spaced-VRM lookup can never match compacted storage; tool exceptions fed to the model unlogged; add normalization + warn traces + one retry. |
| [TKT-067](./TKT-067-assistant-new-chat/TKT-067-assistant-new-chat.md) | Assistant drawer needs a "New chat" button to clear the conversation | P3 (plan 2026-07-06 §2): SPA-only header button clearing `turns`/`input`, disabled while sending. |
| [TKT-068](./TKT-068-assistant-attach-evidence/TKT-068-assistant-attach-evidence.md) | Attach files in the assistant and add them to a case (user-confirmed upload) | P2 (plan 2026-07-06 §3): drawer attach + confirmation card + new staff-role `POST /api/cases/{id}/evidence/upload`; the model stays read-only (TKT-060 invariant). |
| [TKT-069](./TKT-069-assistant-more-tools/TKT-069-assistant-more-tools.md) | Assistant answers more questions — case detail, activity, twins, queues, emails, overdue | P2 (plan 2026-07-06 §4): six new SELECT-only tools + prompt/chips refresh; builds on TKT-066. |
| [TKT-070](./TKT-070-email-body-readability/TKT-070-email-body-readability.md) | Inbox email previews are one unreadable line — keep line breaks, cut noise | P2 (plan 2026-07-06 §5): pure `email-body-clean` domain util (newlines, URLs, quote chains, signatures) wired into fetchMessage/retro-envelope. |
| [TKT-071](./TKT-071-vrm-false-positive-hd4110/TKT-071-vrm-false-positive-hd4110.md) | Job references like HD4110 wrongly captured as a vehicle registration | P1 (plan 2026-07-06 §6): proximity-anchor the loose dateless VRM rule (+ tight anchor for postcode-area prefixes), mirror to the Python sniff (ADR-0018), audited data fix. |
| [TKT-072](./TKT-072-global-search/TKT-072-global-search.md) | The search box doesn't search — global search across cases, emails, providers | P1 (plan 2026-07-06 §7): new `GET /api/search?q=` + SPA results view with the same-VRM grouping header (the "3 same VRM" ask). |
| [TKT-073](./TKT-073-varchar16-overflow-clamp/TKT-073-varchar16-overflow-clamp.md) | Intake write fails with "value too long" — clamp over-length field before insert | P2 (plan 2026-07-06 §8): identify the 03/07 `varchar(16)` overflow field from App Insights, clamp at the mapper with a warn trace. |
| [TKT-084](./TKT-084-pre-instruction-handling/TKT-084-pre-instruction-handling.md) | Pre-instruction directions email unidentified — define a handling lane | P2 drop-note (2026-07-06): directions-before-official-instructions have no taxonomy home; design the lane + hold/correlate behaviour, operator sign-off before build. |
| [TKT-085](./TKT-085-vrm-false-positive-october/TKT-085-vrm-false-positive-october.md) | Registration on case A.PCH26003 logged as "OCTOBER" (VRM false positive) | P1 drop-note (2026-07-06): month word captured as VRM — different shape from TKT-071's HD4110 (all-alpha); root-cause + month/day denylist + audited data fix. |
| [TKT-086](./TKT-086-circumstances-extraction-gaps/TKT-086-circumstances-extraction-gaps.md) | Accident circumstances still not being 100% extracted | P1 drop-note (2026-07-06): `.DOC`+`.eml` failing sample; fix in the sibling engine + measure circumstances coverage across live cases (EVA 12-field impact). |
| [TKT-087](./TKT-087-box-upload-409-conflicts/TKT-087-box-upload-409-conflicts.md) | Box report shows 409 upload conflicts — investigate duplicate archive attempts | P2 drop-note (2026-07-06): 18×409 on `POST upload` (2026-07-03) in the operator's Box report — benign idempotency or a double-processing fingerprint (correlate with TKT-092). |
| [TKT-089](./TKT-089-non-vehicle-images-box/TKT-089-non-vehicle-images-box.md) | Confirm non-vehicle images (signatures/logos) no longer captured/stored on Box | P2 drop-note (2026-07-06): audit ask closing TKT-047's live proof + a new uncovered lane — PDF-extracted letterhead/logo crops landing as case evidence. |
| [TKT-090](./TKT-090-evidence-filename-provider-vrm/TKT-090-evidence-filename-provider-vrm.md) | Evidence filenames carry a wrong "RJS" provider token and "UnknownVRM" | P2 drop-note (2026-07-06): `…__RJS_UnknownVRM_img_1_1.png` on a non-RJS case — locate + fix the naming template in the extraction path. |
| [TKT-091](./TKT-091-outlook-move-fail/TKT-091-outlook-move-fail.md) | Outlook "File to …" move fails live with a 503 from the Data API | P1 drop-note (2026-07-06): `POST /api/inbound/{id}/outlook-move` → **503** on `cespk-api-dev` (operator dev-tools evidence) — NOT the expected B4-grant 403; diagnose via App Insights, fix error-mapping + SPA failure UX; live move test still needs the B4 grant. |
| [TKT-092](./TKT-092-pch-duplicate-cases/TKT-092-pch-duplicate-cases.md) | PCH cases duplicating for no reason | P1 drop-note (2026-07-06): enumerate duplicate PCH case groups, trace one pair to name the vector (multi-mailbox / Graph redelivery / dedup-key miss), idempotency fix + audited merge. |
| [TKT-094](./TKT-094-case-done-status-model/TKT-094-case-done-status-model.md) | Case `done` terminal state — status model + auto-`eva_submitted` on export | P1 (3rd-wave plan 2026-07-07, anchor): nothing advances a case past `ready_for_eva`; add `done` after `eva_submitted` (parity ring 12→13) + fire `eva_submitted` on the Export-for-EVA click. Holds the full `PLAN-case-done-lifecycle.md`. |
| [TKT-095](./TKT-095-case-done-detectors/TKT-095-case-done-detectors.md) | Case `done` detectors — manual → Box report-PDF → sent-email → EVA poll | P1 (plan 2026-07-07, Phase C): shared guarded `mark-done`; manual bridge first, then Box report-PDF / sent-email (dark) / gated EVA-poll detectors. Depends on TKT-094. |
| [TKT-096](./TKT-096-completed-archive-view/TKT-096-completed-archive-view.md) | Completed/Archive view + dashboard drill-through + terminal-scope search fold-in | P2 (plan 2026-07-07, Phase D): `/completed` view + nav (not a 4th queue), tiles drill through, and global search must not exclude terminals. Depends on TKT-094/095; adds a scope criterion to TKT-072. |
| [TKT-097](./TKT-097-cancellation-misclass-query/TKT-097-cancellation-misclass-query.md) | Cancellation email misclassified as a case query | P2 drop-note (2026-07-07): a real cancellation still tagged `case_query` — the live-occurrence miss TKT-041's cancellation lane was awaiting; eval pin + rule precedence. |
| [TKT-098](./TKT-098-inbox-pagination/TKT-098-inbox-pagination.md) | Inbox pagination — cap the inbox page at 15 emails, paginate the rest | P3 drop-note (2026-07-07): SPA inbox paging (15/page) preserving the mailbox-chip filter (TKT-025) + actions (TKT-005). |
| [TKT-099](./TKT-099-qcl-case-po-generation/TKT-099-qcl-case-po-generation.md) | QCL cases not generating Case/PO correctly | P1 drop-note (2026-07-07): QCL provider cases mint a wrong/absent Case/PO — trace the QCL principal-code path through the allocator (TKT-004 territory). No sample supplied. |
| [TKT-100](./TKT-100-qdos-false-vrm-and2/TKT-100-qdos-false-vrm-and2.md) | QDOS false VRM "AND2" invented on emails that don't contain it | P1 drop-note (2026-07-07): every QDOS sample logs "AND2" as the reg though it's not in the email — false-positive VRM (sibling of TKT-085/071); denylist/anchor + audited data fix. |
| [TKT-101](./TKT-101-qdos-cases-wrong-linking/TKT-101-qdos-cases-wrong-linking.md) | QDOS — two distinct refs (46671/1, 46533/1) wrongly linked as one case | P1 drop-note (2026-07-07): different people + QDOS refs collapsed into one case (inverse of TKT-092) — name the dedup-key collision vector (possibly the shared false AND2 VRM), idempotency fix + audited split. |
| [TKT-102](./TKT-102-tractable-received-handling/TKT-102-tractable-received-handling.md) | Tractable received-email handling — categorise, match to case, parse PDF, extract images | P2 drop-note (2026-07-07): recognise the Tractable "New completed lead…" email, match it to its case, parse the PDF Vehicle Information + extract/match the submitted images. Holds the shared Tractable samples. |
| [TKT-103](./TKT-103-tractable-reference-bug/TKT-103-tractable-reference-bug.md) | Tractable "768.00" wrongly captured as the reference number | P2 drop-note (2026-07-07): a monetary/estimate value taken as the provider reference on the Tractable layout (false-token family, cf. TKT-071/085); anchor the ref rule + eval pin. |
| [TKT-105](./TKT-105-remittance-payments-category/TKT-105-remittance-payments-category.md) | Remittance advice classified under payments/billing | P2 drop-note (2026-07-07): inbound remittance-advice emails have no home — route to a payments/billing category (sibling of TKT-037). Sat in the operator's `done/` area but was never ticketed. |
| [TKT-106](./TKT-106-remove-replay-backfill/TKT-106-remove-replay-backfill.md) | Remove the non-viable replay-backfill driver + gate | P2 (operator-requested 2026-07-07, dark-gate audit): the wipe-and-rebuild path is abandoned (TKT-059 — mailboxes retain only ~88/390); remove the dead `replay-backfill` Durable driver + `REPLAY_BACKFILL_ENABLED` so it can't mislead a later session. Keep the TKT-059 finding. Code change → PR + orch deploy. |
| [TKT-108](./TKT-108-completed-tickets-done-folder/TKT-108-completed-tickets-done-folder.md) | Completed tickets → a done/ folder for easier management | P3 (distilled 2026-07-07 from a to-distill drop): move `status: done` ticket folders into `docs/tickets/done/` + make check-tickets/check-doc-links/BOARD follow. Ticket-tracking housekeeping (distinct from TKT-096, the app's completed-**case** view). |

## Blocked — needs operator

| ID | Needs |
|---|---|
| [TKT-004](./TKT-004-case-po-generation/TKT-004-case-po-generation.md) | The live/production Box root id for the allocator fallback (not the test folder). DB mint works (`QDOS26001`). |
| [TKT-010](./TKT-010-delete-case/TKT-010-delete-case.md) | Operator to assign `CollisionSpike.Superuser` to the staff principal (access-control change). Soft-remove + dialog coded; Box delete is ACK-only per ADR-0017. |
| [TKT-032](./TKT-032-misclass-defer-routing/TKT-032-misclass-defer-routing.md) | Operator routing decision for the deferred Audatex + PCD-diminution emails before the rule can be specified. |
| [TKT-057](./TKT-057-ap-diminution-refinement/TKT-057-ap-diminution-refinement.md) | A real inbound diminution instruction email (grounds `D.` detection) + a standalone a.qdos inbound email if one exists; then the SPA case-type control for the review-time AP. refinement ([ADR-0021](../adr/0021-case-po-marker-taxonomy.md)). Also gated behind TKT-056's activation ladder. |
| [TKT-088](./TKT-088-image-role-classification-check/TKT-088-image-role-classification-check.md) | Operator decision on image-role classification (determination already made: it is unbuilt — TKT-064): build the auto-classifier now, keep manual with better UX, or defer. |
| [TKT-104](./TKT-104-tractable-api-integration/TKT-104-tractable-api-integration.md) | Tractable **developer docs** for the full API integration (in-app link generation + direct case ingestion). Deferred until the vendor supplies them; the received-email path (TKT-102) covers the immediate need. |
