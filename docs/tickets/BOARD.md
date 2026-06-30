# Board — ticket tracker

> Kanban mirror of every ticket under [docs/tickets/](./README.md). One row per ticket; the column =
> the ticket's `status` frontmatter. Keep this table in sync when you change a ticket's status (the
> [`scripts/check-tickets.mjs`](../../scripts/check-tickets.mjs) checker validates the frontmatter, not
> the board placement — moving a row is a manual edit). System + format: [README.md](./README.md).
>
> **No live numbers here** — see the registry [live-environment.md](../architecture/live-environment.md)
> ([`LIVE_FACTS.json`](../../LIVE_FACTS.json)).
>
> **Truth standard (2026-06-30).** `done` = the fix is LIVE and proven (test or live probe) with no known
> gap. A ticket whose code is written/merged but **not confirmed working in the live app** stays `now` —
> "code-correct" is not "done". Operator-reported "not live" items (see
> [`to-examine.md`](./to-examine.md)) are kept OUT of Done until verified against the post-clean-slate intake.

## Now — in flight / not yet confirmed live

| ID | Title | Why not done (evidence) |
|---|---|---|
| [TKT-001](./TKT-001-document-parsing.md) | Multi-format extraction + field-drop fix | Parser REDEPLOYED 2026-06-30 + `/api/parse` proves full 12-field extraction live; field-forwarding fix deployed. **E2E (email→case fields) awaiting confirmation on the next real intake.** Add an orch→API seam test. |
| [TKT-002](./TKT-002-pdf-image-extraction.md) | Auto-extract vehicle images + flag unsuitable | Decoupled from automation mode + deployed, but registration-flagging needs `PLATE_OCR_ENABLED` (not set → degrades to a generic note). No orch test; not e2e-verified. |
| [TKT-003](./TKT-003-box-sync.md) | Get `.eml` / images / instructions into the Box folder | Root cause fixed (providers→review_auto + folder/archive/image decoupled from mode, deployed). `boxArchiveEvidence` has **still never run e2e** — verify on the next clean-slate intake (`uploaded>0` + box-fn `upload_file` 200). |
| [TKT-004](./TKT-004-case-po-generation.md) | Allocate the next Case/PO reliably | DEFECT: the authoritative mint is pure DB `MAX+1` — the Box fallback lives only in the preview route. Operator: it must read the **live/real Box area, not the test folder**. With `case_`=0 (clean slate) every provider would mint `…001`. |
| [TKT-005](./TKT-005-email-actions.md) | Make the inbox actionable (dismiss removes from view) | Code audit-passed + in the live SPA bundle, but **operator reports NOT LIVE**. Data-driven (inbound_email rows) — re-verify against the post-clean-slate intake. |
| [TKT-006](./TKT-006-suggested-tags-and-folders.md) | Suggest email categories/tags + Outlook folders | Tag + override-logging coded; **operator reports NOT LIVE** (re-verify post-clean-slate). The "+ Outlook folder sort" half is deliberately deferred (Phase 2). |
| [TKT-009](./TKT-009-clickable-case-and-email.md) | Clickable associated emails + view-full-email | In the live SPA bundle, but **operator reports NOT LIVE**. Needs inbound_email linked to cases at intake — re-verify post-clean-slate. |
| [TKT-010](./TKT-010-delete-case.md) | Delete/remove case with confirm | Soft-remove + dialog coded + live enum rows applied; **operator reports NOT LIVE** — the action is **Superuser-gated** and the principal likely lacks `CollisionSpike.Superuser` (**operator role assignment** — Claude cannot modify access controls). Box = ACK-only per ADR-0017 (reconcile ticket text). |

## Done — live & verified

| ID | Title | Verified by |
|---|---|---|
| [TKT-007](./TKT-007-amalgamated-dashboard.md) | Combine email + intake overviews into one dashboard | audit: endpoint + hooks + UI wired; `dashboard.test.ts` 10/10 |
| [TKT-008](./TKT-008-calendar-date-fields.md) | Calendar picker on the date fields | audit: `DateField` bound + rendered; `date-format.test.ts` 12/12; SPA build PASS |
| [TKT-011](./TKT-011-case-page.md) | Case page de-jargon + layout | audit: full plain-language sweep; no engineer/file-format strings remain |
| [TKT-012](./TKT-012-dashboard-logic.md) | Combined dashboard/queue count contract | audit: lifetime-vs-windowed split; `dashboard.test.ts` 10/10 |
| [TKT-013](./TKT-013-automation-mode.md) | Per-provider automation modes | audit: orchestrator genuinely branches; live providers flipped to review_auto |
| [TKT-014](./TKT-014-acme-placeholder.md) | Remove the `acme.co.uk` placeholder | audit: zero `acme` in source; neutral aria-label |
| [TKT-019](./TKT-019-ticket-system.md) | Markdown ticket system + board + validator | `check-tickets.mjs` 20/0; reachable from docs + CLAUDE.md |
| [TKT-020](./TKT-020-docs-cleanup.md) | Stale-plan cleanup + root-doc reconciliation | `check-doc-links.mjs` PASS; HISTORICAL banners; roots reconciled |

## Next — queued / MVP

| ID | Title | State |
|---|---|---|
| [TKT-015](./TKT-015-ai-assistant.md) | AI suggestion layer (gated) | Coherent foundation, correctly gated-OFF; NOT a working feature (no model deployed on digital-3339-resource) |
| [TKT-016](./TKT-016-ai-image-analysis.md) | Image-analysis VLM sequence | Research-only; pipeline unbuilt |
| [TKT-017](./TKT-017-ai-reg-ocr.md) | Registration-recognition model bench | Research-only; no benchmark run |

## Backlog — not started

| ID | Title | State |
|---|---|---|
| [TKT-018](./TKT-018-ai-case-category.md) | AI total-loss vs repairable categorisation | Explicitly deferred until the pipeline is complete |

## Blocked — needs operator

| ID | Needs |
|---|---|
| [TKT-010](./TKT-010-delete-case.md) | Operator to assign `CollisionSpike.Superuser` to the staff principal (access-control change) |
| [TKT-004](./TKT-004-case-po-generation.md) | The live/production Box root id for the allocator fallback (not the test folder) |
