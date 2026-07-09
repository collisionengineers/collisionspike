---
id: TKT-137
title: Surface triage_category AI suggestions on uncased emails — currently written but invisible
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-120, TKT-015, TKT-006]
research-link: docs/tickets/backlog/TKT-137-uncased-ai-suggestion-surface/evidence/operator-note.md
plan: PLAN-003
---

# TKT-137 — Surface triage_category AI suggestions on uncased emails — currently written but invisible

## Problem

The EMAIL_AI assist rung writes a triage_category ai_suggestion for uncased emails, but no UI renders it: the inbox banner only knows case_link/cancellation suggestions and the AiAssistPanel needs a case. Every AI email-identification verdict on an uncased email is invisible to staff (the TKT-120 Fairway miss stayed hidden this way).

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — batch-B workflow finding, 2026-07-09.
- TKT-120 changes.md: the AI rung ran, returned a (wrong) verdict, and wrote a suggestion nothing renders.

## Proposed change

PROPOSED (not built): render pending triage_category suggestions on the inbox row/preview (plain-language "The assistant thinks this is …" with accept/ignore mapping to the existing review seam); keep suggest-only semantics.

## Acceptance

- An uncased email with a pending triage_category suggestion shows it in the inbox preview with accept/ignore.
- Accepting applies the category via the existing audited review path; ignoring dismisses.
- Verified live on a real pending suggestion.

## Research

Filed 2026-07-09 from the classifier-wave batch report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence/)
