---
id: TKT-155
title: Simplify the dashboard around Not Ready, Review and Held
status: verify
priority: P2
area: dashboard
tickets-it-relates-to: [TKT-007, TKT-012, TKT-026, TKT-054, TKT-122, TKT-130, TKT-164]
research-link: docs/tickets/verify/TKT-155-dashboard-three-state-layout/evidence/operator-note.md
plan: PLAN-004
---

# Simplify the dashboard around Not Ready, Review and Held

## Problem
The live dashboard repeats queue information in three places and gives most of the page to two large “Needs action” lists. Staff want one calm, centred overview whose primary choices are Not Ready, Review and Held.

## Evidence
- [Operator note](./evidence/operator-note.md) — requested removals and three-card layout.
- `evidence/current-dashboard.png` and `evidence/current-needs-action.png` — supplied live screenshots after import.
- TKT-054 — introduced the queue snapshot this request supersedes.

## Proposed change
The three-card dashboard is built and deployed. Independent live verification reopened this ticket to repair the fixed navigation rail at narrow widths and bring the focus indicator above the required contrast threshold.

## Live verification regression — 2026-07-12
- Queue content and all three drill-throughs are correct.
- At 390px width, the fixed 240px navigation rail crushes and clips the dashboard cards.
- The current translucent red focus halo measures approximately 2.80:1 against white, below the 3:1 requirement.

## Acceptance
- The dashboard's primary intake group contains exactly three equal-status cards: Not Ready, Review and Held. Each uses the authoritative queue count and opens its matching queue.
- The “Needs action — oldest first” region, both “Check the flagged details” and “Progress the case” lists, their “Show all” controls, and the lower-right “Queues” count region are removed from the dashboard.
- The left navigation's direct queue links remain available and use the same authoritative counts; no fourth count implementation is introduced.
- The former separate red Held banner is removed or reduced to non-duplicative status messaging; Held is not visually treated as an afterthought.
- Inbox and Today/This week information remain if their data is healthy, but are centred and balanced under the three cards with a clear reading order and materially less empty/duplicated space.
- Loading, partial-error, empty and populated states reserve stable space and identify only the affected section; stale values are never silently presented as current.
- All cards are keyboard and screen-reader operable, have unique accessible names, visible focus, sufficient contrast, and no color-only meaning.
- The layout works at wide desktop, 1024px, tablet/narrow mobile, short viewport, and 200% zoom without overlap, horizontal scrolling or clipped actions.
- Rendered copy uses plain handler language and contains none of the banned implementation/meta terms in `AGENTS.md`.
- Component tests pin the removed regions, exactly three top cards, authoritative routes/counts, partial-error state and responsive structure.
- Live Chrome and DevTools verification records desktop/narrow screenshots, correct drill-through for all three cards, no console error, and no failed dashboard requests.

## Research
Distilled 2026-07-12 from the operator request and screenshots. The image-generation concept is exploratory evidence only; production remains Fluent v9 and follows the existing app tokens.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
