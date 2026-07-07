---
id: TKT-043
title: Images-received / report-chaser email misrouted (scope to confirm)
status: now
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

Phase 2 of the [Rules Engine v2 plan](../../../plans/rules_engine_v2_plan_9ba034c4.plan.md)
(`case_update` lane + `images_received` subtype); the sample joins the eval corpus either way.

## Status update — 2026-07-02 (next — taxonomy + policy built; this sample still misses; needs D7 + gates)

The `case_update` category and `images_received` subtype exist in the authored taxonomy-v2 DDL delta
(`84fb102`, [docs/gated.md](../../../gated.md) §D7) and the case-update/suggested-attach machinery is built
(the same `triagePolicy`/`ai_suggestion`/SPA-tab stack as TKT-023/TKT-041 —
`7bac2ee`/`00980d5`/`9fb16cf`/`69ec02e`). **Honest gap:** this ticket's own sample (`RE
Ref160404_GN14GBE_... - Chaser for engineers report.eml`, manifest id `tkt043-images-existing-case`) is
joined to the eval corpus with expected `case_update`/`images_received`, but **still scores a miss**
(`category_correct: false`) even against the current **in-repo** v2-ready engine — see
[baseline-v2.json](../../../../scripts/eval-email/baseline-v2.json). It currently returns
`receiving_work`/`existing_provider_instruction` instead: recognising it as *work* correctly, but not yet
as an update on an *existing* case, because that needs the ref-gate/context policy (open-case ref match),
not text signals alone — and the ref-gate's acting path is gated off (`TRIAGE_REF_GATE_ENABLED`) pending
D7. Not yet deployed live either way. The scope-to-confirm question in the Problem section above is still
open — not resolved by this pass.
