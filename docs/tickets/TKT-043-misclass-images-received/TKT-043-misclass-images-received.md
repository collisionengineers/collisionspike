---
id: TKT-043
title: Images-received / report-chaser email misrouted (scope to confirm)
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-034, TKT-030]
research-link: docs/plans/rules_engine_v2_plan_9ba034c4.plan.md
---

# Images-received / report-chaser email misrouted (scope to confirm)

## Problem

Authored 2026-07-02 from raw evidence only — this folder was dropped without a note. The folder name
says **images-received**, but the evidence is a **report chaser** carrying an images PDF for an
existing case (`Ref 160404 / GN14GBE`): a provider mail that should route to its **existing case**
(attach the images evidence + archive) rather than sit unlinked or mint anything new.

**Scope to confirm with the operator at Phase-2 kickoff:** whether this ticket is (a) the
images-on-an-existing-case routing failure (overlaps TKT-034's matched-case arm), (b) another
thread-scope chaser misclassification (overlaps TKT-030), or (c) both on the one sample.

## Evidence

- `RE Ref160404_GN14GBE_Nissan Qashqai Tekna_Mr Louis Cannell - Chaser for engineers report.eml`
- `images - cvd.pdf`

## Delivery

Phase 2 of the [Rules Engine v2 plan](../../plans/rules_engine_v2_plan_9ba034c4.plan.md)
(`case_update` lane + `images_received` subtype); the sample joins the eval corpus either way.
