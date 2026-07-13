---
id: TKT-168
title: Make Not Ready status language agree with the queue
status: now
priority: P1
area: ui
tickets-it-relates-to: [TKT-012, TKT-026, TKT-130, TKT-155, TKT-157]
research-link: docs/tickets/now/TKT-168-unify-not-ready-language/evidence/not-ready-needs-review-live.png
plan: PLAN-004
---

# Make Not Ready status language agree with the queue

## Problem
The live Not Ready queue contains a generic status badge and reason filter labelled “Needs review”. That tells a handler both that the case is not ready and that it needs review, even though Review is a separate queue reserved for cases that could theoretically be sent to EVA. The two labels describe incompatible workflow states.

## Evidence
- [Live queue screenshot](./evidence/not-ready-needs-review-live.png) — Not Ready is selected while the reason chip and several row badges say “Needs review”.
- [Second supplied screenshot](./evidence/not-ready-needs-review-live-2.png) — confirms the same contradiction across multiple rows.
- `mockup-app/src/components/StatusBadge.tsx` maps the stored `needs_review` status directly to the rendered label “Needs review”.
- TKT-130 defines Review as the fully ready queue and Not Ready as the home for missing or unresolved requirements.

## Proposed change
Keep the stored status value for compatibility, but translate it into the canonical handler-facing workflow language. A generic `needs_review` case must display “Not ready” wherever it appears as a case status or Not Ready reason. More specific blocker labels such as “Missing fields” and “Missing images” remain specific. Field-level review provenance is a different concept and is not renamed by this ticket.

## Acceptance
- A case in the Not Ready queue never displays “Needs review” as its case status, reason, filter, count or action wording.
- The stored `needs_review` case status renders as “Not ready” in the queue, case detail and any shared case-status component.
- Specific statuses continue to render their useful reason, including “Missing fields”, “Missing images”, “Duplicate risk” and “Error”.
- Review remains the only handler-facing label for the queue of cases that pass the canonical EVA readiness predicate.
- The change does not rename field-level provenance/review states or alter persisted status codes.
- Queue reason counts and filtering continue to use the underlying status value while displaying the corrected label.
- Component tests cover the shared status label and the Not Ready reason/filter presentation; a rendered-copy test prevents the contradictory phrase returning on case-status surfaces.
- Live Chrome verification proves the Not Ready queue, affected rows and a case detail no longer show the contradictory status, while Review membership remains unchanged.

## Research
Distilled 2026-07-13 from the operator's live screenshots and the binding queue semantics in TKT-130. This is a language-consistency repair, not a new lifecycle state.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)

