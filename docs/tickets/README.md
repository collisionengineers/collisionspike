# Tickets — the atomic work system

> **What this is.** A Markdown-only ticket system: **one ticket = one per-ticket folder** holding the
> ticket `.md` (with YAML frontmatter), its `changes.md` + `verification.md` audit artifacts, and an
> `evidence/` folder, tracked on a Kanban-style board ([BOARD.md](./BOARD.md)). It is the **granular** layer
> under [ROADMAP.md](../../ROADMAP.md): the ROADMAP is the strategic forward worklist (phases / Now /
> Next / Later); a ticket is a single, self-contained work item with a status, a priority, and a link
> to the research pack that backs it. Live numbers are **never** copied into a ticket — they live only
> in the registry [`LIVE_FACTS.json`](../../LIVE_FACTS.json) / [live-environment.md](../architecture/live-environment.md)
> (per [docs/MAINTENANCE.md](../MAINTENANCE.md)).

This system was created to move the `work-todo-spike` operator notes out of an unindexed drop-zone and
into trackable, atomic units. It follows the same proven shape as the binding-review workflow
([docs/reviews/README.md](../reviews/README.md)): every item carries its source, its research, and its
state.

## Where tickets live

```
docs/tickets/
  README.md   ← this file (the system + index)
  BOARD.md    ← the Kanban tracker (Now / Next / Backlog / Done tables)
  TKT-NNN-<slug>/             ← one folder per work item
    TKT-NNN-<slug>.md         ← the ticket spec (frontmatter + body)
    changes.md                ← what actually changed (commits / files / summary)
    verification.md           ← how it was proven (tests, live probe) + what's still pending
    evidence/                 ← raw source material (operator note + .eml/PDF/screenshots), where applicable
```

Each ticket carries its **own audit trail**: `changes.md` records the code that was written, and
`verification.md` records how it was proven against the live system (or honestly states what is still
unverified — `done` means **live and proven**, not merely "code-correct"). The two are linked from the
ticket `.md`'s **Artifacts** footer so the doc-link gate's reachability check finds them.

The original **work-todo-spike research packs** stay where they are — under
[`docs/plans/work-todo-spike/`](../plans/work-todo-spike/) — and the first 20 tickets **link** their pack
rather than absorbing it; do **not** delete it. Tickets distilled directly from an operator drop-note
(TKT-021+) instead carry their raw material in their own `evidence/` folder and point `research-link`
there. The map below indexes every ticket.

## Ticket file format

Every ticket is a Markdown file beginning with a YAML frontmatter block:

```yaml
---
id: TKT-001
title: Short plain-English title
status: now            # backlog | now | next | done | blocked
priority: P1           # P0 (drop-everything) … P3 (nice-to-have)
area: parsing          # parsing | evidence | box | intake | email | ui | dashboard | ai | platform | docs
tickets-it-relates-to: [TKT-002, TKT-017]   # other ticket ids, or []
research-link: docs/plans/work-todo-spike/<area>/research/<name>.md
---
```

| Field | Meaning |
|---|---|
| `id` | Unique `TKT-NNN` id. Never reused. |
| `title` | One-line plain-English summary (handler-facing, no jargon). |
| `status` | `backlog` (not started) · `now` (in flight this session) · `next` (queued / MVP next) · `done` · `blocked` (needs operator / another ticket). |
| `priority` | `P0`–`P3`. P0 = production-blocking; P3 = cosmetic. |
| `area` | The subsystem the work touches (see the enum above). |
| `tickets-it-relates-to` | Dependency / sibling ids, or `[]`. |
| `research-link` | The repo-relative path to the backing research pack (must resolve). |

Body sections (lightweight — keep it short, the research pack holds the depth):

```md
# Title
## Problem        — what is wrong / wanted (from the operator stub)
## Evidence        — current source paths / live behaviour (from the research pack)
## Proposed change — the intended fix, at a high level
## Acceptance      — how we know it is done
## Research         — link the stub + research pack (+ any sample data)
## Artifacts        — links to ./changes.md, ./verification.md (+ ./evidence/ for distilled tickets)
```

`research-link` resolves to a real repo file. The first 20 tickets point at their
`docs/plans/work-todo-spike/<area>/research/<name>.md` pack; tickets distilled straight from an operator
drop-note (TKT-021+) point at their own `docs/tickets/TKT-NNN-<slug>/evidence/operator-note.md`.

## Lifecycle

```
backlog ──▶ now ──▶ done
   │         ▲
   └─▶ next ─┘        (blocked ⇄ any active state when it needs the operator / another ticket)
```

1. A work item starts as a **research pack** under `docs/plans/work-todo-spike/<area>/research/`
   (fan-out research already done) and an operator **stub** alongside it.
2. It is **distilled into a ticket** here (`backlog`), linking both.
3. When picked up it moves to **`now`** (or `next` if queued for the following slice).
4. On completion it moves to **`done`**; if it stalls on an operator action or a dependency it moves
   to **`blocked`** (record what unblocks it in `tickets-it-relates-to` / the body).
5. [BOARD.md](./BOARD.md) mirrors the current column of every ticket.

**Research packs are advisory, not authoritative.** They were produced by fan-out research agents and
are detailed and broadly accurate, but any live fact (counts, gates, mailbox set, function names) must
be **verified against the registry** ([live-environment.md](../architecture/live-environment.md) /
[`LIVE_FACTS.json`](../../LIVE_FACTS.json)) before you act on it — the packs are point-in-time snapshots.

## Validation

A zero-dependency checker keeps the board honest:

```sh
node scripts/check-tickets.mjs
```

It verifies every ticket has complete frontmatter, that `status` / `priority` use the allowed enums,
that `research-link` resolves to a real file, and that ids are unique. Wire it into your pre-commit
sweep alongside [`scripts/check-doc-links.mjs`](../../scripts/check-doc-links.mjs) (see
[docs/MAINTENANCE.md](../MAINTENANCE.md)). Agent skills:
[`.agents/skills/ticket-implement`](../../.agents/skills/ticket-implement/SKILL.md) (pick up / close out),
[`.agents/skills/ticket-distill`](../../.agents/skills/ticket-distill/SKILL.md) (create from operator notes).

## Index — every ticket

**Cohort A — distilled from `work-todo-spike` research packs (TKT-001…020).** Each links its pack.

| Area (`docs/plans/work-todo-spike/…`) | Ticket |
|---|---|
| `document-parsing/` | [TKT-001](./TKT-001-document-parsing/TKT-001-document-parsing.md) |
| `pdf-image-extraction/` | [TKT-002](./TKT-002-pdf-image-extraction/TKT-002-pdf-image-extraction.md) |
| `box/box-sync` | [TKT-003](./TKT-003-box-sync/TKT-003-box-sync.md) |
| `box/case-po-gen` | [TKT-004](./TKT-004-case-po-generation/TKT-004-case-po-generation.md) |
| `email-management/actual-management-of-emails` | [TKT-005](./TKT-005-email-actions/TKT-005-email-actions.md) |
| `email-management/suggested-tags-and-folders` | [TKT-006](./TKT-006-suggested-tags-and-folders/TKT-006-suggested-tags-and-folders.md) |
| `ui-changes/amalgamated-dashboard` | [TKT-007](./TKT-007-amalgamated-dashboard/TKT-007-amalgamated-dashboard.md) |
| `ui-changes/calendar-box-on-date-fields` | [TKT-008](./TKT-008-calendar-date-fields/TKT-008-calendar-date-fields.md) |
| `ui-changes/clickable-case-and-email` | [TKT-009](./TKT-009-clickable-case-and-email/TKT-009-clickable-case-and-email.md) |
| `ui-changes/delete-case` | [TKT-010](./TKT-010-delete-case/TKT-010-delete-case.md) |
| `ui-changes/casepage` | [TKT-011](./TKT-011-case-page/TKT-011-case-page.md) |
| `dashboard-logic/` | [TKT-012](./TKT-012-dashboard-logic/TKT-012-dashboard-logic.md) |
| `automation-mode/` | [TKT-013](./TKT-013-automation-mode/TKT-013-automation-mode.md) |
| `ui-changes/acme/` | [TKT-014](./TKT-014-acme-placeholder/TKT-014-acme-placeholder.md) |
| `ai-assistant/` (umbrella + model-selection + backend-data) | [TKT-015](./TKT-015-ai-assistant/TKT-015-ai-assistant.md) |
| `ai-assistant/ai-tools/image-analysis` | [TKT-016](./TKT-016-ai-image-analysis/TKT-016-ai-image-analysis.md) |
| `ai-assistant/ai-tools/reg-ocr` | [TKT-017](./TKT-017-ai-reg-ocr/TKT-017-ai-reg-ocr.md) |
| `ai-assistant/ai-tools/defer-ai-case-category` | [TKT-018](./TKT-018-ai-case-category/TKT-018-ai-case-category.md) |
| `ticket-system/` | [TKT-019](./TKT-019-ticket-system/TKT-019-ticket-system.md) |
| `docs-cleanup/` | [TKT-020](./TKT-020-docs-cleanup/TKT-020-docs-cleanup.md) |

**Cohort B — distilled from operator drop-notes (TKT-021…040).** Raw material lives in each ticket's
`evidence/`. TKT-029…040 are the `miscategorised-emails` email-classifier cluster (all relate to TKT-006).

| Source drop-note | Ticket |
|---|---|
| `connexus/` | [TKT-021](./TKT-021-connexus-intermediary/TKT-021-connexus-intermediary.md) |
| `enrichment-extraction-fail/` | [TKT-022](./TKT-022-docx-extraction-fail/TKT-022-docx-extraction-fail.md) |
| `follow-up-docs/` | [TKT-023](./TKT-023-follow-up-docs/TKT-023-follow-up-docs.md) |
| `image-based-new-case/` | [TKT-024](./TKT-024-image-based-new-case/TKT-024-image-based-new-case.md) |
| `inbox-filter/` | [TKT-025](./TKT-025-inbox-source-filter/TKT-025-inbox-source-filter.md) |
| `queue-tracking/` | [TKT-026](./TKT-026-queue-tracking/TKT-026-queue-tracking.md) |
| `status/` | [TKT-027](./TKT-027-intake-triage-status/TKT-027-intake-triage-status.md) |
| `work-provider-not-populating/` | [TKT-028](./TKT-028-work-provider-not-populating/TKT-028-work-provider-not-populating.md) |
| `miscategorised-emails/case-summary` | [TKT-029](./TKT-029-misclass-case-summary/TKT-029-misclass-case-summary.md) |
| `miscategorised-emails/chasing-report` | [TKT-030](./TKT-030-misclass-chasing-report/TKT-030-misclass-chasing-report.md) |
| `miscategorised-emails/client-chasing-email` | [TKT-031](./TKT-031-misclass-client-chasing/TKT-031-misclass-client-chasing.md) |
| `miscategorised-emails/defer-need-to-check` | [TKT-032](./TKT-032-misclass-defer-routing/TKT-032-misclass-defer-routing.md) |
| `miscategorised-emails/email-reply` | [TKT-033](./TKT-033-misclass-email-reply/TKT-033-misclass-email-reply.md) |
| `miscategorised-emails/images-received` | [TKT-034](./TKT-034-images-received-routing/TKT-034-images-received-routing.md) |
| `miscategorised-emails/information-request` | [TKT-035](./TKT-035-misclass-information-request/TKT-035-misclass-information-request.md) |
| `miscategorised-emails/instructions1` | [TKT-036](./TKT-036-misclass-instructions/TKT-036-misclass-instructions.md) |
| `miscategorised-emails/invoice-request` | [TKT-037](./TKT-037-misclass-invoice-request/TKT-037-misclass-invoice-request.md) |
| `miscategorised-emails/query-miscategorised` | [TKT-038](./TKT-038-misclass-query-ack/TKT-038-misclass-query-ack.md) |
| `miscategorised-emails/query1` | [TKT-039](./TKT-039-misclass-query-report-support/TKT-039-misclass-query-report-support.md) |
| `miscategorised-emails/roadworthy-request` | [TKT-040](./TKT-040-misclass-roadworthy-request/TKT-040-misclass-roadworthy-request.md) |

**Cohort C — distilled from operator planning-session plans (2026-07-06, TKT-066…080).** Two
root-level plan documents were distilled wholesale; each ticket's `evidence/operator-note.md`
carries its plan section (the full plan is preserved once per cluster, in the anchor ticket's
evidence), and each ticket defines a strict multi-class **Verification requirements** proof
standard (offline tests + gates + live probes + data/telemetry evidence).

| Source plan | Tickets |
|---|---|
| `PLAN-assistant-intake-search-fixes.md` (anchor: [TKT-066](./TKT-066-assistant-lookup-observability/TKT-066-assistant-lookup-observability.md) holds the full plan) | [TKT-066](./TKT-066-assistant-lookup-observability/TKT-066-assistant-lookup-observability.md) lookup+observability · [TKT-067](./TKT-067-assistant-new-chat/TKT-067-assistant-new-chat.md) new-chat · [TKT-068](./TKT-068-assistant-attach-evidence/TKT-068-assistant-attach-evidence.md) attach-evidence · [TKT-069](./TKT-069-assistant-more-tools/TKT-069-assistant-more-tools.md) more tools · [TKT-070](./TKT-070-email-body-readability/TKT-070-email-body-readability.md) body readability · [TKT-071](./TKT-071-vrm-false-positive-hd4110/TKT-071-vrm-false-positive-hd4110.md) VRM false positive · [TKT-072](./TKT-072-global-search/TKT-072-global-search.md) global search · [TKT-073](./TKT-073-varchar16-overflow-clamp/TKT-073-varchar16-overflow-clamp.md) overflow clamp |
| `PLAN-inspection-address-repair.md` (anchor: [TKT-075](./TKT-075-inspection-corpus-pipeline/TKT-075-inspection-corpus-pipeline.md) holds the full plan) | [TKT-074](./TKT-074-shell-hook-fail-closed/TKT-074-shell-hook-fail-closed.md) shell-hook P0 blocker · [TKT-075](./TKT-075-inspection-corpus-pipeline/TKT-075-inspection-corpus-pipeline.md) corpus pipeline (A) · [TKT-076](./TKT-076-inspection-provider-scope-proximity/TKT-076-inspection-provider-scope-proximity.md) scoping+proximity (B) · [TKT-077](./TKT-077-location-assist-photos/TKT-077-location-assist-photos.md) photo assist (C) · [TKT-078](./TKT-078-location-assist-ai-escalation/TKT-078-location-assist-ai-escalation.md) AI escalation (D) · [TKT-079](./TKT-079-inspection-ui-provider-policy/TKT-079-inspection-ui-provider-policy.md) UI polish (E) · [TKT-080](./TKT-080-inspection-reseed-live/TKT-080-inspection-reseed-live.md) live reseed (F) |

**Cohort D — distilled from `to-distill/` operator drop-notes (2026-07-06, TKT-081…093).** Ten
drop-note folders (notes + `.eml`/PDF/screenshot samples) were distilled and the drop-zone
removed; each ticket's `evidence/` carries the verbatim note + samples, and each defines the
strict multi-class **Verification requirements** proof standard. The `email-mistags/` folder
split into four subtype tickets, extending the TKT-029…040 misclass cluster.

| Source drop-note | Ticket |
|---|---|
| `email-mistags/acknowledgement` (4 samples) | [TKT-081](./TKT-081-misclass-ack-batch/TKT-081-misclass-ack-batch.md) |
| `email-mistags/case-query` (2 threads) | [TKT-082](./TKT-082-misclass-query-as-new-work/TKT-082-misclass-query-as-new-work.md) |
| `email-mistags/instructions-received` | [TKT-083](./TKT-083-misclass-instructions-unidentified/TKT-083-misclass-instructions-unidentified.md) |
| `email-mistags/pre-instruction` | [TKT-084](./TKT-084-pre-instruction-handling/TKT-084-pre-instruction-handling.md) |
| `A.PCH26003/` | [TKT-085](./TKT-085-vrm-false-positive-october/TKT-085-vrm-false-positive-october.md) |
| `circumstances/` | [TKT-086](./TKT-086-circumstances-extraction-gaps/TKT-086-circumstances-extraction-gaps.md) |
| `BOXreport/` | [TKT-087](./TKT-087-box-upload-409-conflicts/TKT-087-box-upload-409-conflicts.md) |
| `image-sections/` | [TKT-088](./TKT-088-image-role-classification-check/TKT-088-image-role-classification-check.md) |
| `non-vehicle-images/` | [TKT-089](./TKT-089-non-vehicle-images-box/TKT-089-non-vehicle-images-box.md) |
| `odd-filename-bug/` | [TKT-090](./TKT-090-evidence-filename-provider-vrm/TKT-090-evidence-filename-provider-vrm.md) |
| `outlook-move/` | [TKT-091](./TKT-091-outlook-move-fail/TKT-091-outlook-move-fail.md) |
| `pch-duplicates/` | [TKT-092](./TKT-092-pch-duplicate-cases/TKT-092-pch-duplicate-cases.md) |
| `suggest-attach/` | [TKT-093](./TKT-093-auto-attach-matched-emails/TKT-093-auto-attach-matched-emails.md) |

See [BOARD.md](./BOARD.md) for the live status of each.

## Proposed additions (operator to vet)

Beyond the distilled tickets, [`proposed-usability-additions.md`](../plans/work-todo-spike/proposed-usability-additions.md)
captures **10 usability features judged genuinely important but not yet requested** (global quick-find,
bulk triage, intake-health alerting, …) — proposals for the operator to prioritise into `backlog` tickets.
