---
id: TKT-041
title: Cancelled/closed-case emails have no home (no cancellation concept)
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-023, TKT-046]
research-link: docs/plans/rules_engine_v2_plan_9ba034c4.plan.md
---

# Cancelled/closed-case emails have no home (no cancellation concept)

## Problem

Providers email us when a claim/case is **cancelled or closed** (e.g. subject
`Claim Cancelled - SBL-B0649696`). The classifier has **no cancellation concept**, so these land
`other/other` at abstain confidence and nothing connects them to the case they cancel. Staff have to
spot them in the Other pile and act manually.

## Wanted

A `cancellation` triage category (taxonomy v2): match the email to its open case by ref/job-ref, then
**propose** a close/hold with a note + audit trail — **staff-confirmed, never an automatic close**
(the terminal case status `removed` already exists). Unmatched cancellations surface for review.

## Evidence

- `source-emails/` — 13 real `.eml` samples (a mix of cancellation, closure, instruction and
  estimate mails — useful as both positives and near-miss negatives for the eval corpus).

## Delivery

Phase 2 of the [Rules Engine v2 plan](../../plans/rules_engine_v2_plan_9ba034c4.plan.md) (taxonomy v2
+ triage policy). The old `TKT-041-merge-fix` note that shared this id was split out to
[TKT-052](../TKT-052-merge-provider-loss/TKT-052-merge-provider-loss.md).
