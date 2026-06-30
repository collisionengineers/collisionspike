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
> **Last reconciled 2026-06-30** against the read-only end-to-end verification of the two post-clean-slate
> live intakes (`dc307411` partial + `ca3acf21`/`QDOS26001` full): TKT-001/002/003/006/009 are now
> **VERIFIED-LIVE** and moved to Done. (This replaces the former `to-examine.md`, now removed — its items
> are resolved here.)

## Now — in flight / not yet confirmed live

| ID | Title | Why not done (evidence) |
|---|---|---|
| [TKT-005](./TKT-005-email-actions/TKT-005-email-actions.md) | Make the inbox actionable (dismiss removes from view) | CODE-COMPLETE, not confirmed live — shipped in the SPA bundle but the e2e pass exercised the data pipeline, not the UI. Needs a live SPA click-through (inbound_email rows now exist post-reset). See [verification](./TKT-005-email-actions/verification.md). |

## Done — live & verified

| ID | Title | Verified by ([per-ticket verification.md]) |
|---|---|---|
| [TKT-001](./TKT-001-document-parsing/TKT-001-document-parsing.md) | Multi-format extraction + field-drop fix | **VERIFIED-LIVE** — `dc307411` 8 EVA cols + 7 provenance rows, `QDOS26001` 6 cols + 5; parse/caseResolve 6×/0-fail; `parser-eva-fields.test.ts`. |
| [TKT-002](./TKT-002-pdf-image-extraction/TKT-002-pdf-image-extraction.md) | Auto-extract vehicle images + flag unsuitable | **VERIFIED-LIVE** (extraction) — 63 image rows = telemetry `extracted:63`. Unsuitable-flag half awaits `PLATE_OCR_ENABLED`. |
| [TKT-003](./TKT-003-box-sync/TKT-003-box-sync.md) | Get `.eml` / images / instructions into the Box folder | **VERIFIED-LIVE** — `QDOS26001` Box folder holds `message.eml`+PDF; `uploaded:2`. Non-blocking: `box_file_id`/`box_synced_at` write-back missing. |
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

## Next — queued / MVP

| ID | Title | State |
|---|---|---|
| [TKT-015](./TKT-015-ai-assistant/TKT-015-ai-assistant.md) | AI suggestion layer (gated) | Coherent foundation, correctly gated-OFF; NOT a working feature (no model deployed). |
| [TKT-016](./TKT-016-ai-image-analysis/TKT-016-ai-image-analysis.md) | Image-analysis VLM sequence | Research-only; pipeline unbuilt. |
| [TKT-017](./TKT-017-ai-reg-ocr/TKT-017-ai-reg-ocr.md) | Registration-recognition model bench | Research-only; no benchmark run. |

## Backlog — not started

| ID | Title | Source / note |
|---|---|---|
| [TKT-018](./TKT-018-ai-case-category/TKT-018-ai-case-category.md) | AI total-loss vs repairable categorisation | Deferred until the pipeline is complete. |
| [TKT-021](./TKT-021-connexus-intermediary/TKT-021-connexus-intermediary.md) | Resolve Connexus → real provider (PCH/SBL) | Drop-note: intermediary mis-flagged as new enquiry. |
| [TKT-022](./TKT-022-docx-extraction-fail/TKT-022-docx-extraction-fail.md) | `.docx` claim-form extraction fails | Drop-note (P1): garbled fields on a Word claim form. |
| [TKT-023](./TKT-023-follow-up-docs/TKT-023-follow-up-docs.md) | Link follow-up docs/emails to the existing case + Box | Drop-note: follow-up wrongly minted a new case. |
| [TKT-024](./TKT-024-image-based-new-case/TKT-024-image-based-new-case.md) | Image-only new-case form | Drop-note: drop instruction-only fields. |
| [TKT-025](./TKT-025-inbox-source-filter/TKT-025-inbox-source-filter.md) | Mark + filter inbox by source mailbox | Drop-note: info/engineers/desk marker + filter. |
| [TKT-026](./TKT-026-queue-tracking/TKT-026-queue-tracking.md) | Queue counts don't match the actual queues | Drop-note. |
| [TKT-027](./TKT-027-intake-triage-status/TKT-027-intake-triage-status.md) | Intermediate intake status beyond "new" | Drop-note. |
| [TKT-028](./TKT-028-work-provider-not-populating/TKT-028-work-provider-not-populating.md) | `work_provider` not populating on intake | Drop-note (P1) — MAY already be fixed; verify the exact example (QDOS populated live). |
| [TKT-029](./TKT-029-misclass-case-summary/TKT-029-misclass-case-summary.md) | Case-summary email misclassified as new case | Misclass cluster (→ TKT-006). |
| [TKT-030](./TKT-030-misclass-chasing-report/TKT-030-misclass-chasing-report.md) | Report-chaser misclassified as new work | Misclass cluster (P1) — scan the received email, not the thread. |
| [TKT-031](./TKT-031-misclass-client-chasing/TKT-031-misclass-client-chasing.md) | Client report-chaser misrouted to 'Other' | Misclass cluster. |
| [TKT-033](./TKT-033-misclass-email-reply/TKT-033-misclass-email-reply.md) | Simple reply to our query misclassified as new work | Misclass cluster (P1) — shares thread-scoping with TKT-030. |
| [TKT-034](./TKT-034-images-received-routing/TKT-034-images-received-routing.md) | Inbound images: match to case / Box / flag | Misclass cluster (→ TKT-003/004). |
| [TKT-035](./TKT-035-misclass-information-request/TKT-035-misclass-information-request.md) | Information-request misclassification (placeholder) | Misclass cluster — **needs a sample email from the operator**. |
| [TKT-036](./TKT-036-misclass-instructions/TKT-036-misclass-instructions.md) | Work-instructions email misclassified as query | Misclass cluster (P1). |
| [TKT-037](./TKT-037-misclass-invoice-request/TKT-037-misclass-invoice-request.md) | Invoice request misclassified as new case | Misclass cluster. |
| [TKT-038](./TKT-038-misclass-query-ack/TKT-038-misclass-query-ack.md) | Bare acknowledgement ('Thanks Ed') misclassified as query | Misclass cluster. |
| [TKT-039](./TKT-039-misclass-query-report-support/TKT-039-misclass-query-report-support.md) | Report-support request misclassified as new case | Misclass cluster. |
| [TKT-040](./TKT-040-misclass-roadworthy-request/TKT-040-misclass-roadworthy-request.md) | Informal roadworthy work-request misrouted to 'Other' | Misclass cluster. |

## Blocked — needs operator

| ID | Needs |
|---|---|
| [TKT-004](./TKT-004-case-po-generation/TKT-004-case-po-generation.md) | The live/production Box root id for the allocator fallback (not the test folder). DB mint works (`QDOS26001`). |
| [TKT-010](./TKT-010-delete-case/TKT-010-delete-case.md) | Operator to assign `CollisionSpike.Superuser` to the staff principal (access-control change). Soft-remove + dialog coded; Box delete is ACK-only per ADR-0017. |
| [TKT-032](./TKT-032-misclass-defer-routing/TKT-032-misclass-defer-routing.md) | Operator routing decision for the deferred Audatex + PCD-diminution emails before the rule can be specified. |
