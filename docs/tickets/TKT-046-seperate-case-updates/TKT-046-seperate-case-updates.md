---
id: TKT-046
title: Separate case updates from general queries (own lane + attach-to-case)
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-023, TKT-041]
research-link: docs/tickets/TKT-046-seperate-case-updates/evidence/operator-note.md
---

# Separate case updates from general queries (own lane + attach-to-case)

## Problem (operator drop-note, verbatim in [evidence/operator-note.md](./evidence/operator-note.md))

Case updates and general queries are mixed together. E-mails that belong to a case on the system
(a chase, or further clarification on anything) need their **own tab/lane** and should be
**attached to the existing case** — general queries are separate; Case Updates should be standalone.

## Wanted

A `case_update` triage category (taxonomy v2) with a defined boundary against
`query_existing_work`: ref-match **+ new evidence** → case update (suggest-attach first); ref-match
+ question-only → the query lane. The inbox then facets the two separately.

## Delivery

Phase 2 of the [Rules Engine v2 plan](../../plans/rules_engine_v2_plan_9ba034c4.plan.md)
(ref-gate + taxonomy v2 + the SPA lane split under review 010726's inbox constraints).
