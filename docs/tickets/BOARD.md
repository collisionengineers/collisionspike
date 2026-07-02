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
> **Last reconciled 2026-07-02** — rules-engine-v2 **build** pass (the six-phase build completed this
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
| [TKT-001](./TKT-001-document-parsing/TKT-001-document-parsing.md) | Multi-format extraction + field-drop fix | Follow-up deployed 2026-07-01 (parser live-proven on triage `.eml`; body supplement deployed). Pending: e2e re-intake Postgres proof on triage `.doc` path. See [changes-regression-01-07-26](./TKT-001-document-parsing/changes-regression-01-07-26.md). |
| [TKT-005](./TKT-005-email-actions/TKT-005-email-actions.md) | Make the inbox actionable (dismiss removes from view) | CODE-COMPLETE, not confirmed live — shipped in the SPA bundle but the e2e pass exercised the data pipeline, not the UI. Needs a live SPA click-through (inbound_email rows now exist post-reset). See [verification](./TKT-005-email-actions/verification.md). |
| [TKT-027](./TKT-027-intake-triage-status/TKT-027-intake-triage-status.md) | Intermediate intake status beyond "new" | DEPLOYED — api+orch live; intake `ingested` audit proof pending next email. See [verification](./TKT-027-intake-triage-status/verification.md). |
| [TKT-021](./TKT-021-connexus-intermediary/TKT-021-connexus-intermediary.md) | Resolve Connexus → real provider (PCH/SBL) | Image-Source intermediary resolution code DEPLOYED live 2026-07-02; activates once the D8 seed delta (Connexus → PCH/SBL) is applied. See [verification](./TKT-021-connexus-intermediary/verification.md). |
| [TKT-025](./TKT-025-inbox-source-filter/TKT-025-inbox-source-filter.md) | Mark + filter inbox by source mailbox | DEPLOYED live in the SPA bundle 2026-07-02 (toolbar mailbox-chip filter). Needs a live click-through. See [verification](./TKT-025-inbox-source-filter/verification.md). |
| [TKT-028](./TKT-028-work-provider-not-populating/TKT-028-work-provider-not-populating.md) | `work_provider` not populating on intake | The operator's own example already worked via domain match (confirmed 2026-06-30); a content-string mapping DEPLOYED 2026-07-02 as a second signal, awaiting live proof. See [verification](./TKT-028-work-provider-not-populating/verification.md). |
| [TKT-031](./TKT-031-misclass-client-chasing/TKT-031-misclass-client-chasing.md) | Client report-chaser misrouted to 'Other' | Eval-passing on the deployed engine (committed corpus, 2026-07-02); awaiting a live occurrence/probe to close. See [verification](./TKT-031-misclass-client-chasing/verification.md). |
| [TKT-039](./TKT-039-misclass-query-report-support/TKT-039-misclass-query-report-support.md) | Report-support request misclassified as new case | Eval-passing on the deployed engine (committed corpus, 2026-07-02); awaiting a live occurrence/probe to close. See [verification](./TKT-039-misclass-query-report-support/verification.md). |
| [TKT-047](./TKT-047-email-sigs-box/TKT-047-email-sigs-box.md) | Email signature images archived to Box in error | Non-inline raster floor DEPLOYED live on orch 2026-07-02; awaiting live proof on a real signature-bearing email. |
| [TKT-051](./TKT-051-pch-connexus/TKT-051-pch-connexus.md) | PCH not identified (doc-content name + @pch-ltd.com senders) | Identification-mapping code DEPLOYED live 2026-07-02 (doc-content "PCH" now maps to a `work_provider_id`); the `@pch-ltd.com` domain addition activates once the D8 seed delta is applied. |

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

## Next — queued / MVP

| ID | Title | State |
|---|---|---|
| [TKT-015](./TKT-015-ai-assistant/TKT-015-ai-assistant.md) | AI suggestion layer (gated) | Phase 4 of [rules-engine-v2](../plans/rules_engine_v2_plan_9ba034c4.plan.md) wired ONE concrete lane (email-triage categorisation) to a real, keyless AOAI call 2026-07-02 — still gated OFF (`EMAIL_AI_ENABLED`/`AI_ASSIST_ENABLED` both absent); the case/damage-assessment + image/reg-OCR consumers remain unbuilt. See [verification](./TKT-015-ai-assistant/verification.md). |
| [TKT-016](./TKT-016-ai-image-analysis/TKT-016-ai-image-analysis.md) | Image-analysis VLM sequence | Research-only; pipeline unbuilt. |
| [TKT-017](./TKT-017-ai-reg-ocr/TKT-017-ai-reg-ocr.md) | Registration-recognition model bench | Research-only; no benchmark run. |
| [TKT-023](./TKT-023-follow-up-docs/TKT-023-follow-up-docs.md) | Link follow-up docs/emails to the existing case + Box | Generalised ref-gate DEPLOYED gated-OFF 2026-07-02 (`TRIAGE_REF_GATE_ENABLED` unset); needs D7 (DDL) + that gate flip. See [verification](./TKT-023-follow-up-docs/verification.md). |
| [TKT-041](./TKT-041-cancelled-case/TKT-041-cancelled-case.md) | Cancelled/closed-case emails have no home (no cancellation concept) | `cancellation` taxonomy + engine built and eval-proven (12/13 recall; the 13th is a flagged hold-language taxonomy gap needing an operator decision); needs D7 + the parser deploy. |
| [TKT-043](./TKT-043-misclass-images-received/TKT-043-misclass-images-received.md) | Images-received / report-chaser email misrouted (scope to confirm) | `case_update`/`images_received` taxonomy + policy built; this ticket's own sample still misses even in the eval corpus (needs the ref-gate/context policy, gated OFF) — needs D7 + gates. |
| [TKT-046](./TKT-046-seperate-case-updates/TKT-046-seperate-case-updates.md) | Separate case updates from general queries (own lane + attach-to-case) | `case_update` vs `query_existing_work` precedence encoded as eval targets + built; needs D7 + gates. |

## Backlog — not started

| ID | Title | Source / note |
|---|---|---|
| [TKT-018](./TKT-018-ai-case-category/TKT-018-ai-case-category.md) | AI total-loss vs repairable categorisation | Deferred until the pipeline is complete. |
| [TKT-022](./TKT-022-docx-extraction-fail/TKT-022-docx-extraction-fail.md) | `.docx` claim-form extraction fails | Drop-note (P1): garbled fields on a Word claim form. |
| [TKT-024](./TKT-024-image-based-new-case/TKT-024-image-based-new-case.md) | Image-only new-case form | Drop-note: drop instruction-only fields. |
| [TKT-026](./TKT-026-queue-tracking/TKT-026-queue-tracking.md) | Queue counts don't match the actual queues | Drop-note. |
| [TKT-034](./TKT-034-images-received-routing/TKT-034-images-received-routing.md) | Inbound images: match to case / Box / flag | Misclass cluster (→ TKT-003/004). |
| [TKT-035](./TKT-035-misclass-information-request/TKT-035-misclass-information-request.md) | Information-request misclassification (placeholder) | Misclass cluster — **needs a sample email from the operator**. |
| [TKT-044](./TKT-044-mileage-calc-check/TKT-044-mileage-calc-check.md) | Mileage calculations look ~10,000 over expected values | Drop-note (authored 2026-07-02); enrichment MOT-estimate check — not part of rules-engine-v2. |
| [TKT-052](./TKT-052-merge-provider-loss/TKT-052-merge-provider-loss.md) | Merged image-only case loses the provider (merge logic) | Split from the old TKT-041-merge-fix folder (2026-07-02); TKT-028 territory. |

## Blocked — needs operator

| ID | Needs |
|---|---|
| [TKT-004](./TKT-004-case-po-generation/TKT-004-case-po-generation.md) | The live/production Box root id for the allocator fallback (not the test folder). DB mint works (`QDOS26001`). |
| [TKT-010](./TKT-010-delete-case/TKT-010-delete-case.md) | Operator to assign `CollisionSpike.Superuser` to the staff principal (access-control change). Soft-remove + dialog coded; Box delete is ACK-only per ADR-0017. |
| [TKT-032](./TKT-032-misclass-defer-routing/TKT-032-misclass-defer-routing.md) | Operator routing decision for the deferred Audatex + PCD-diminution emails before the rule can be specified. |
