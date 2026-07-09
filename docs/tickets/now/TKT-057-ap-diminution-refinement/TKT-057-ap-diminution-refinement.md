---
id: TKT-057
title: AP. total-loss review flow + diminution (D.) detection grounding
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-056, TKT-032]
research-link: docs/adr/0021-case-po-marker-taxonomy.md
---

# AP. total-loss review flow + diminution detection grounding

## Problem

Two ADR-0021 refinements deliberately deferred from TKT-056:

1. **AP. (total-loss audit) is a review-time decision** — the real QDOS instruction letters are
   byte-identical whether the audit later resolves repairable (`A.`) or total-loss (`AP.`); the
   split emerges from the inspection (PAV outcome). The API seam exists (PATCH
   `/api/cases/{id}` `caseType: 'audit_total_loss'`), but the SPA has no case-type control yet,
   and the derived audit ID (`marker + case_po`) is not yet surfaced/used at EVA-export/Box time.
2. **D. (diminution) detection is ungrounded** — `diminution_phrases` ship review-first (case-type
   signal only, never a `D.` mint) because no real inbound diminution instruction email has been
   captured (the `D.PCH26190` folder holds outputs only).

## Blocked on

- **Operator**: a real d.qdos / D.PCH inbound **instruction email** (+ docs) to ground
  `diminution_phrases`; a standalone a.qdos inbound email if one exists (confirms the standalone
  QDOS audit signal vs the dual-letter path).
- TKT-056's activation ladder (gate flip) — this ticket's behaviours only matter with
  `AUDIT_CASES_ENABLED=true`.

## Wanted

- SPA case-page control for `caseType` (audit → audit_total_loss refinement; diminution confirm),
  showing the derived marker ID for QDOS dual cases.
- Grounded `diminution_phrases` (sibling-first, `resources/triage-rules.json`) + the D. mint
  un-gated from review-first once verified against the operator's example.
- Decide whether diminution routing interacts with TKT-032's deferred misclass-routing rules.

## Artifacts

- [changes.md](./changes.md) — AP.-half build record (2026-07-09 UI wave).
