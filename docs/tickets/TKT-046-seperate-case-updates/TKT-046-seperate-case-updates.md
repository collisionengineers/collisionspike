---
id: TKT-046
title: Separate case updates from general queries (own lane + attach-to-case)
status: next
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

## Status update — 2026-07-02 (next — precedence encoded + built; needs D7 + gates)

The `case_update`/`query_existing_work` boundary this ticket asks for is defined and encoded as explicit
confusion-matrix eval targets, per the plan: ref-match + new evidence → `case_update`; ref-match +
question-only → the query lane; cancellation phrases trump both (so the currently-correct chaser handling
cannot regress) — see [rules_engine_v2_plan_9ba034c4.plan.md § Phase 2](../../plans/rules_engine_v2_plan_9ba034c4.plan.md).
The `case_update` taxonomy (`84fb102`, [docs/gated.md](../../gated.md) §D7), the standalone SPA tab +
attach-to-case affordance (`69ec02e`), and the underlying triage-policy machinery
(`7bac2ee`/`00980d5`/`9fb16cf`) are all built. No dedicated eval-corpus sample targets this ticket by id
(it is a lane/precedence rule, not a single misclassification instance) — its behaviour is exercised
indirectly via the TKT-041/TKT-043 samples. **Not yet active:** the DDL (D7) is not applied live and the
ref-gate acting path (`TRIAGE_REF_GATE_ENABLED`) is gated off, so today's live inbox still shows one
undifferentiated queue rather than the two lanes.
