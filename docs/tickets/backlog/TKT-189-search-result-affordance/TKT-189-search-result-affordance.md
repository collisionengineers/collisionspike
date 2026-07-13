---
id: TKT-189
title: Make search results clearly actionable
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-009, TKT-072, TKT-157]
research-link: docs/tickets/backlog/TKT-189-search-result-affordance/evidence/search-results-live.md
plan: PLAN-004
---

# Make search results clearly actionable

## Problem
The search page presents results as a plain text list. It is difficult to distinguish result types, scan the identifying details or tell which content opens a case or email. Hover, focus, loading, empty and error states do not provide a coherent interaction model.

## Evidence
- [Operator source material](./evidence/operator-source/) shows the visually plain live result list and weak click affordance.
- TKT-072 established the search function and destinations; this ticket improves presentation and interaction without changing which records the search service returns.
- Signed-in interaction evidence is to be recorded at [search-results-live.md](./evidence/search-results-live.md).

## Proposed change
PROPOSED (not built):
- Present each supported result type in a labelled section with a count and structured result rows.
- Give each row a clear primary link, useful identifying metadata and visible hover/focus treatment.
- Provide deliberate loading, no-results, error and partial-result states that keep the query visible and offer an appropriate next action.

## Acceptance
- **A1.** Results are grouped under headings for each result type returned by the existing search contract, with a visible count per group; at minimum, cases and emails are visually distinguishable when both are present.
- **A2.** A case result shows its complete Case/PO as the primary link plus available registration, claimant or work provider and current handler-facing status; an email result shows its subject as the primary link plus available sender, received date and handler-facing email type. Missing metadata is omitted or shown with a plain placeholder, never a raw stored value.
- **A3.** Each result has an unmistakable interactive treatment: pointer hover and keyboard focus are visible, the primary link is underlined or otherwise conventionally identifiable, and any whole-row click invokes the same destination without creating nested or competing controls.
- **A4.** Tab and Shift+Tab reach results in visual order, Enter activates the focused primary link, focus is never removed without navigation, and section headings, result counts and link names are announced meaningfully by a screen reader.
- **A5.** Opening a case or email reaches the exact existing destination, including the exact email in its preview where supported; browser Back returns to the same query and result position without silently changing the search.
- **A6.** Loading shows a stable progress state, no results names the query and offers a clear way to revise it, an error offers a retry, and a partial result response says that some results could not be shown without discarding successful groups.
- **A7.** The result layout remains readable and actionable at supported desktop/narrow widths and 200% zoom, with long subjects and Case/PO values contained rather than overlapping metadata.
- **A8.** The existing search matching, result identity and permission checks remain authoritative; the presentation layer does not invent, merge or drop records and does not expose a result the signed-in handler cannot open.

## Validation
- Add component tests for mixed, single-type, missing-metadata, loading, empty, error and partial-result responses.
- Add keyboard, focus-order, accessible-name and screen-reader-structure tests plus responsive/long-text visual regression coverage.
- Add route tests for case, exact-email and browser-Back behaviour while preserving the query.
- Run the existing search contract and permission tests and compare rendered result identifiers with the returned identifiers.
- After deployment, repeat a known mixed query such as the operator’s registration search while signed in, open one case and one email by pointer and keyboard, return to the result set, and capture the states in the planned evidence artifact.

## Research
Distilled 2026-07-13 from the operator’s live search review. The signed-in query inventory, navigation proof and state screenshots belong in [evidence/search-results-live.md](./evidence/search-results-live.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator search note](./evidence/operator-source/info.md)
- [Planned research evidence](./evidence/search-results-live.md)
