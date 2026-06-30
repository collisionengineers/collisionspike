---
id: TKT-007
title: Combine email + intake overviews into one compact dashboard
status: done
priority: P2
area: ui
tickets-it-relates-to: [TKT-012, TKT-005]
research-link: docs/plans/work-todo-spike/ui-changes/research/amalgamated-dashboard.md
---

# Combine email + intake overviews into one compact dashboard

## Problem
The e-mail overview and the intake overview are separate. Combine them into a single **compact,
non-cluttered** dashboard, pushing the more specific controls onto their own pages.

## Evidence
The case dashboard and the inbox dashboard are currently distinct surfaces; the count contract for the
combined view needs pinning down (TKT-012 owns the count semantics). See the research pack.

## Proposed change
Design one amalgamated dashboard that joins the case pipeline summary with inbound-email triage at a
glance, with drill-downs to the dedicated pages for detail and controls.

## Acceptance
A single dashboard shows both email and intake state compactly; specific actions live on their own pages;
counts agree with the contract from TKT-012.

## Research
- Operator stub: [amalgamated-dashboard.md](../../plans/work-todo-spike/ui-changes/amalgamated-dashboard.md)
- Research pack: [research/amalgamated-dashboard.md](../../plans/work-todo-spike/ui-changes/research/amalgamated-dashboard.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
