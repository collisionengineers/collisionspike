---
id: TKT-052
title: Merged image-only case loses the provider (merge logic wrong)
status: verify
priority: P2
area: intake
tickets-it-relates-to: [TKT-028, TKT-041]
research-link: docs/tickets/verify/TKT-052-merge-provider-loss/evidence/operator-note.md
---

# Merged image-only case loses the provider (merge logic wrong)

> **Sweep PENDING 2026-07-10** — fix deployed + offline-proven (22/22), but **no live route merge
> has ever executed** (0 `mergeCases` POSTs in 90d) and the SPA dialog's same-provider candidate
> filter makes the fill branch UI-unreachable for the exact operator scenario; see
> [verification.md](./verification.md) (follow-up candidate: relax the dialog filter to ADR-0010).

## Problem (operator drop-note, verbatim in [evidence/operator-note.md](./evidence/operator-note.md))

Merge thinking is wrong for cases that are merged together: the image-only side has no provider,
and the main (instructions) case's provider is potentially unknown — so the merged result can end up
with **no provider** when one half actually knew it.

## Notes

Split out of the old `TKT-041-merge-fix` folder on 2026-07-02 (TKT-041 now covers cancellation
only). Screenshot evidence: [`1.png`](./1.png). This is TKT-028 territory (provider population at
resolve/merge) — the merge must prefer whichever side carries a resolved provider, with provenance.

## Delivery

Rides the Phase-3 identification work of the
[Rules Engine v2 plan](../../../plans/rules_engine_v2_plan_9ba034c4.plan.md) (provider resolution at
caseResolve), with the merge-preference fix verified against the ADR-0010 dedup ladder.

## Artifacts

- [changes.md](./changes.md) — merge-provider inheritance build record (2026-07-09 intake wave).
