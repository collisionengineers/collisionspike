---
id: TKT-257
title: Refresh LIVE_FACTS and the live-environment doc
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-252, TKT-253, TKT-254, TKT-255]
research-link: docs/tickets/backlog/TKT-257-refresh-live-facts-and-environment/evidence/distillation-note.md
plan: PLAN-009
---

# Refresh LIVE_FACTS and the live-environment doc

## Problem
`LIVE_FACTS.json` and `docs/operations/live-environment.md` are stale: they record the subscription offer as a
free trial and carry out-of-date app-tier function counts and retirement states. The registry should record
reality, not intent.

## Evidence
Read-only live pass 2026-07-19: the subscription offer is pay-as-you-go, not a free trial
(`subscriptionPolicies.quotaId` is the PAYG offer, spending limit off). On the app-tier function counts, two
distinct facts: (i) the in-repo `cloud-inventory-2026-07-17.md` **over-counts the API app** — but
`LIVE_FACTS.json`'s API figure already matches live, so no LIVE_FACTS change is needed there; (ii)
`LIVE_FACTS.json`'s **orchestration** count is the figure that has genuinely drifted, having risen since its
last dated snapshot after the 2026-07-17 orchestration deploy — that is the app-tier count TKT-257 corrects in
the registry. The resources retired by tickets 1–3 also need reflecting. `LIVE_FACTS.json`'s own rule requires
updates only from dated read-only evidence, never inferred from source.

## Proposed change
As the **last** ticket in the plan, refresh `LIVE_FACTS.json` and `live-environment.md` from a dated read-only
inventory captured in the same change set: correct the offer to pay-as-you-go, update the app-tier function
counts, and record the retirements and dispositions from tickets 1–4. The exact numeric values live only in
`LIVE_FACTS.json` and `live-environment.md` (the leakage-exempt registry files), not in this ticket's prose.

## Acceptance
- **A1.** The `LIVE_FACTS.json` offer/tier is corrected to pay-as-you-go and `live-environment.md`'s stale
  free-trial line is corrected.
- **A2.** The app-tier function counts and retired-resource states are updated from a dated read-only
  inventory captured in the same change set — no value inferred from source. Specifically the drifted
  orchestration count is corrected in `LIVE_FACTS.json`; the API figure is confirmed already-correct (it is
  `cloud-inventory-2026-07-17.md`, not the registry, that over-counts the API).
- **A3.** This change lands last, after tickets 1–4's dispositions, so the registry records reality.
- **A4.** `check:docs` passes: volatile numbers appear only in `LIVE_FACTS.json` / `live-environment.md`, not
  leaked into other prose.
- **A5.** `lastVerified` and `verificationMode` are updated with the dated evidence, and the change set
  validates against a fresh inventory.

## Validation
- Diff `LIVE_FACTS.json` and `live-environment.md` against a same-day read-only inventory; run `check:docs`
  and confirm no leakage; confirm the sequencing (this ticket closes last).

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 6; the PAYG offer, the API function-count over-count in
`cloud-inventory-2026-07-17.md` (registry API figure already correct), the drifted orchestration count, and
the stale free-trial line in `live-environment.md` were re-verified read-only on 2026-07-19 — see the banked
[PLAN-009 live-verification dossier](../../plans/PLAN-009.dossier.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
