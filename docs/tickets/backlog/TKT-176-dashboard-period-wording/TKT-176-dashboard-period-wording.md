---
id: TKT-176
title: Use clear period wording on the dashboard
status: backlog
priority: P3
area: ui
tickets-it-relates-to: [TKT-007, TKT-012, TKT-155, TKT-157]
research-link: docs/tickets/backlog/TKT-176-dashboard-period-wording/evidence/dashboard-period-wording-live.md
plan: PLAN-004
---

# Use clear period wording on the dashboard

## Problem
The dashboard uses short phrases such as “In today”, “Submitted today” and “Cleared this week”. They are harder to scan than the language case handlers use, and “submitted” or “cleared” does not consistently describe work that has been sent over.

## Evidence
- [Operator source material](./evidence/operator-source/) shows the live dashboard labels and supplies the replacement wording.
- TKT-155 owns the three-state dashboard layout; this ticket is limited to the wording inside that layout and does not redefine its counts.
- Post-deployment comparison evidence is to be captured at [dashboard-period-wording-live.md](./evidence/dashboard-period-wording-live.md).

## Proposed change
PROPOSED (not built):
- Use the labels “New cases today”, “Sent over today” and “Sent over this week”.
- Keep the existing day/week boundaries, count sources and drill-down destinations unchanged.
- Apply the same wording wherever the corresponding dashboard figures are presented at supported widths.

## Acceptance
- **A1.** The dashboard labels the three figures exactly “New cases today”, “Sent over today” and “Sent over this week”; “In today”, “Submitted today” and “Cleared this week” are absent from rendered dashboard copy.
- **A2.** Each renamed figure retains its existing definition, time boundary, count source and drill-down destination; this copy change does not move a case between figures.
- **A3.** A figure with a zero, one or multi-digit count remains understandable when read visually and by a screen reader, without relying on icon meaning alone.
- **A4.** All three labels remain complete and non-overlapping at the production desktop and narrow dashboard layouts and at 200% browser zoom.

## Validation
- Add rendered-copy tests for all three exact labels and negative assertions for the retired phrases.
- Run the existing dashboard count and drill-down tests to prove the copy change has not altered membership or navigation.
- Run responsive and accessibility checks at the supported dashboard breakpoints and 200% zoom.
- After deployment, compare each signed-in dashboard figure with its destination list and capture the labelled dashboard at the future research path.

## Research
Distilled 2026-07-13 from the operator’s dashboard wording review. The signed-in comparison and screenshot belong in [evidence/dashboard-period-wording-live.md](./evidence/dashboard-period-wording-live.md); no verification has been claimed yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator wording note](./evidence/operator-source/wording.md)
- [Planned research evidence](./evidence/dashboard-period-wording-live.md)
