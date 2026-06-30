---
id: TKT-012
title: Define the combined dashboard/queue count contract
status: done
priority: P2
area: dashboard
tickets-it-relates-to: [TKT-007]
research-link: docs/plans/work-todo-spike/dashboard-logic/research/dashboard-logic.md
---

# Define the combined dashboard/queue count contract

## Problem
The dashboard count logic is under-specified. The operator stub is empty; the nearest signal is the
amalgamated-dashboard ask (TKT-007). Pin down a single dashboard contract that joins the case pipeline
with inbound-email triage and fixes the count semantics.

## Evidence
Current logic risks (from the research pack): case dashboard and inbox dashboard are separate; stage
counts and queue counts differ but stage clicks land on broader queues; one "today/this week" strip
includes a lifetime total; some dashboard fields are read but not consistently maintained; several routes
load every case and aggregate in memory; and `api/src` trails the deployed route surface. (Verify the
live function/route surface against the registry [live-environment.md](../../architecture/live-environment.md)
before relying on the pack's snapshot.)

## Proposed change
Define the combined dashboard + inbound-triage acceptance contract: which counts exist, what each click
filters to, and that stage counts and the queue they open are consistent. Then reconcile `api/src` with
the live route surface before feature work.

## Acceptance
A written count contract; stage counts match the queue a click opens; no lifetime total inside a
today/this-week strip; aggregation approach documented.

## Research
- Operator stub: [dashboard-logic.md](../../plans/work-todo-spike/dashboard-logic/dashboard-logic.md) (empty — see `dashboard1.png` / `dashboard2.png` alongside it)
- Research pack: [research/dashboard-logic.md](../../plans/work-todo-spike/dashboard-logic/research/dashboard-logic.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
