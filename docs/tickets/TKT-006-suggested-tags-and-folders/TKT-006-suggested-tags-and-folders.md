---
id: TKT-006
title: Suggest email categories/tags + Outlook folders, log overrides
status: done
priority: P2
area: email
tickets-it-relates-to: [TKT-005, TKT-015]
research-link: docs/plans/work-todo-spike/email-management/research/suggested-tags-and-folders.md
---

# Suggest email categories/tags + Outlook folders, log overrides

## Problem
The inbox should **suggest** categories/tags for each email (initially as suggestions, not automation),
and sort mail into Outlook sub-folders (Instructions / Queries (+ query subtypes) / Images / bespoke).
When a suggestion is overwritten, **log the override** — that feedback is valuable training data for a
future automated system.

Suggested tag fields: Provider/Principal code (if known); Type (Inspection / Audit / Diminution /
Query); whether logged-by-bot as a case; Status (managed by the app); future: total-loss vs repairable.

## Evidence
A deterministic inbound classifier already runs pre-case; this ticket adds the **suggestion surface** +
the **override log**. Treat AI-derived suggestions as observations first (see TKT-015), promoted only by
deterministic rule or human confirmation.

## Proposed change
Surface suggested category/tag + target folder on each inbound email; persist accepted vs overridden
choices (with the override reason) as feedback data; keep it suggestion-mode until accuracy is proven.

## Acceptance
Each email shows a suggested tag + folder; an override is recorded with before/after; nothing is
auto-applied without confirmation in suggestion mode.

## Research
- Operator stub: [suggested-tags-and-folders.md](../../plans/work-todo-spike/email-management/suggested-tags-and-folders.md)
- Research pack: [research/suggested-tags-and-folders.md](../../plans/work-todo-spike/email-management/research/suggested-tags-and-folders.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
