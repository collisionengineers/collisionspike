# Board — ticket tracker

> Kanban mirror of every ticket under [docs/tickets/](./README.md). One row per ticket; the column =
> the ticket's `status` frontmatter. Keep this table in sync when you change a ticket's status (the
> [`scripts/check-tickets.mjs`](../../scripts/check-tickets.mjs) checker validates the frontmatter, not
> the board placement — moving a row is a manual edit). System + format: [README.md](./README.md).
>
> **No live numbers here** — see the registry [live-environment.md](../architecture/live-environment.md)
> ([`LIVE_FACTS.json`](../../LIVE_FACTS.json)).

## Now — in flight this session

| ID | Title | Pri | Area | Research |
|---|---|---|---|---|
| [TKT-001](./TKT-001-document-parsing.md) | Fix multi-format document extraction regression | P1 | parsing | [pack](../plans/work-todo-spike/document-parsing/research/document-parsing.md) |
| [TKT-002](./TKT-002-pdf-image-extraction.md) | Auto-extract vehicle images from PDFs + flag unsuitable | P1 | evidence | [pack](../plans/work-todo-spike/pdf-image-extraction/research/pdf-image-extraction.md) |
| [TKT-003](./TKT-003-box-sync.md) | Get `.eml` / images / instructions into the Box folder | P1 | box | [pack](../plans/work-todo-spike/box/research/box-sync.md) |
| [TKT-004](./TKT-004-case-po-generation.md) | Allocate the next Case/PO number reliably | P1 | intake | [pack](../plans/work-todo-spike/box/research/case-po-gen.md) |
| [TKT-005](./TKT-005-email-actions.md) | Make the inbox actionable (dismiss removes from view) | P2 | email | [pack](../plans/work-todo-spike/email-management/research/actual-management-of-emails.md) |
| [TKT-006](./TKT-006-suggested-tags-and-folders.md) | Suggest email categories/tags + Outlook folders, log overrides | P2 | email | [pack](../plans/work-todo-spike/email-management/research/suggested-tags-and-folders.md) |
| [TKT-007](./TKT-007-amalgamated-dashboard.md) | Combine email + intake overviews into one compact dashboard | P2 | ui | [pack](../plans/work-todo-spike/ui-changes/research/amalgamated-dashboard.md) |
| [TKT-008](./TKT-008-calendar-date-fields.md) | Calendar picker on the date-of-incident / instruction fields | P3 | ui | [pack](../plans/work-todo-spike/ui-changes/research/calendar-box-on-date-fields.md) |
| [TKT-009](./TKT-009-clickable-case-and-email.md) | Make associated emails clickable + view-full-email link | P3 | ui | [pack](../plans/work-todo-spike/ui-changes/research/clickable-case-and-email.md) |
| [TKT-010](./TKT-010-delete-case.md) | Delete/remove case with confirm + optional Box-folder removal | P2 | ui | [pack](../plans/work-todo-spike/ui-changes/research/delete-case.md) |
| [TKT-011](./TKT-011-case-page.md) | Case page de-jargon + layout fixes | P2 | ui | [pack](../plans/work-todo-spike/ui-changes/research/casepage.md) |
| [TKT-012](./TKT-012-dashboard-logic.md) | Define the combined dashboard/queue count contract | P2 | dashboard | [pack](../plans/work-todo-spike/dashboard-logic/research/dashboard-logic.md) |
| [TKT-013](./TKT-013-automation-mode.md) | Define + enforce the per-provider automation modes | P2 | platform | [pack](../plans/work-todo-spike/automation-mode/research/am.md) |
| [TKT-014](./TKT-014-acme-placeholder.md) | Remove the `acme.co.uk` placeholder from provider fields | P3 | ui | [pack](../plans/work-todo-spike/ui-changes/acme/research/acme.md) |
| [TKT-019](./TKT-019-ticket-system.md) | Build the Markdown ticket system + board + validator | P2 | docs | [pack](../plans/work-todo-spike/ticket-system/research/new-planning-system.md) |
| [TKT-020](./TKT-020-docs-cleanup.md) | Stale-plan cleanup + root-doc reconciliation | P2 | docs | [pack](../plans/work-todo-spike/docs-cleanup/research/plans-dir.md) |

## Next — queued / MVP this session

| ID | Title | Pri | Area | Research |
|---|---|---|---|---|
| [TKT-015](./TKT-015-ai-assistant.md) | AI suggestion layer (observation-first, gated) | P2 | ai | [pack](../plans/work-todo-spike/ai-assistant/research/ai-assistant.md) |
| [TKT-016](./TKT-016-ai-image-analysis.md) | Image-analysis VLM sequence (vehicle / reg / location) | P2 | ai | [pack](../plans/work-todo-spike/ai-assistant/ai-tools/research/image-analysis.md) |
| [TKT-017](./TKT-017-ai-reg-ocr.md) | Registration-recognition model research + bench | P2 | ai | [pack](../plans/work-todo-spike/ai-assistant/ai-tools/research/reg-ocr.md) |

## Backlog — not started

| ID | Title | Pri | Area | Research |
|---|---|---|---|---|
| [TKT-018](./TKT-018-ai-case-category.md) | AI VLM total-loss vs repairable categorisation (deferred) | P3 | ai | [pack](../plans/work-todo-spike/ai-assistant/ai-tools/research/defer-ai-case-category.md) |

## Blocked — needs operator / a dependency

| ID | Title | Pri | Area | Blocked on |
|---|---|---|---|---|
| _(none)_ | | | | |

## Done

| ID | Title | Pri | Area |
|---|---|---|---|
| _(none yet)_ | | | |
