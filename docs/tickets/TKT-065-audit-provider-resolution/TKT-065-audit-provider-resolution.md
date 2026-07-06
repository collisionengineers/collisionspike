---
id: TKT-065
title: Audit cases resolve NO work provider (leaked "EVA (Engineers)" masked a real bug)
status: now
priority: P1
area: pipeline
tickets-it-relates-to: [TKT-051, TKT-056, TKT-021, TKT-028]
research-link: docs/adr/0011-work-provider-intermediary-garage-roles.md
---

# Audit cases resolve NO work provider (leaked "EVA (Engineers)" masked a real bug)

> **DEPLOYED + BACKFILLED 2026-07-06** — forward fix live on `cespk-orch-dev` + `cespk-api-dev`;
> the 20 already-mislabelled cases are re-resolved/cleaned live. Awaiting a **live-occurrence probe**
> (next real PCH/QDOS audit email resolving its provider at intake) to close — ties to
> [[TKT-056]] step-6. One operator data item open: QDOS `known_email_domains` (see below).

## Problem

The operator reported cases **still** showing "EVA (Engineers)" as their work provider, and asked
why a **fresh** intake produces a **blank** provider when it should produce the **correct** one
(PCH/QDOS). Investigation showed the [[TKT-056]] fix (engine-v2.6 layout-name suppression + the
Data-API denylist + the D9 corpus delta) only ever **stopped the wrong label** — it never
**recovered the right provider**. The denylist was masking a genuine resolution failure.

### Root cause (code-verified, engine-v2.6 live)

An audit email = a PCH/QDOS **instruction** (often a legacy `.doc`) **plus an attached third-party
"Exclusive Vehicle Assessors" report** (`.pdf`, parser layout "EVA (Engineers)",
`engineer_report:true`). The provider went blank via a three-way interaction:

1. `orchestration/src/functions/activities/parse.ts::selectInstructionIndex` picked the **wrong
   document**: signal 1 (extraction `work_provider`) is empty for the `.doc` (FC1 has no reliable
   legacy `.doc` reader → 422 → candidate dropped) and `''` for the EVA report (v2.6 suppression);
   signal 2 misses (the audit instruction content-types as `report`, the EVA report as `instruction`
   but engineer-report-excluded); signal 3 fell through to **PDF-first → the EVA report**.
2. engine-v2.6 blanks the selected EVA report's `work_provider`.
3. Only the **one selected envelope** was forwarded, so the instruction's `PCH`/`QDOS` signal was
   discarded — starving the Data-API content-match (`applyParserFields` →
   `matchWorkProviderByContentString`). With the sender domain also unmatched (QDOS unseeded;
   Connexus a deliberate intermediary → no `work_provider_id`), the case became `newClient` → no
   Case/PO, **Held**, `work_provider_id` NULL, and the UI (`mappers.ts:220`) fell through to the
   stale free-text `eva_work_provider = "EVA (Engineers)"`.

## Change (shipped)

**Forward fix (deployed 2026-07-06):**
- `parse.ts` `resolveWorkProviderAcrossDocs` — forward the first non-engineer-report, real
  `work_provider` found across **all** parsed candidates, independent of which envelope is chosen for
  field extraction (**1a**). `intakeOrchestrator.ts` prefers this over the chosen envelope's value.
- `parse.ts` `selectInstructionIndex` signal-3 never chooses an engineer-report layout over a
  non-engineer candidate (**1b**).
- `api/src/functions/internal.ts` `applyParserFields` — single-candidate intermediary fallback: fill
  `work_provider_id` when content-match is unmatched/denylisted and the sender's intermediary routes
  for exactly one provider; **>1 stays Held, never guessed** (**1c**).
- Tests: `parse.test.ts` selection + `resolveWorkProviderAcrossDocs`; `apply-parser-fields.test.ts`.

**Backfill (applied live 2026-07-06,
`migration/assets/schema/deltas/2026-07-06-backfill-eva-mislabelled-cases.sql`):** 20 pre-fix cases —
re-resolved 14 (direct `pch-ltd.com` senders → PCH, unambiguous), cleared all 20 free-text labels +
20 stale `workProvider` provenance rows. The 6 `connexus.co.uk` intermediary-only cases ({PCH,SBL})
left blank + Held for a human (never guessed). No Case/PO minted (ADR-0022 cutover concern).

**Also:** `migration/assets/schema/deltas/2026-07-06-pch-display-name.sql` — PCH `display_name`
"PCH (name pending)" → "Performance Car Hire" (so the resolved cases show the real name).

## Known contributing cause (scoped follow-up — not blocking)

Legacy binary `.doc` is unreadable on the FC1 Linux host, which is why signal 1 is empty for `.doc`
instructions. The real fix is the already-known **parser container migration** (ROADMAP Later) or
upstream `.docx`/PDF. 1a makes the pipeline resolve correctly for every *readable* instruction
(`.docx`/PDF/body) regardless.

## Operator data item (mirrors gated D3)

**QDOS `known_email_domains` is empty** — a direct QDOS audit can't domain-resolve. Supply QDOS's real
sending domain(s) and it gets seeded (idempotent `916`-style delta) so direct QDOS audits resolve at
Stage-1 domain-match. Until then, a QDOS audit resolves only when the instruction content names QDOS.

## Acceptance

- [x] Forward fix deployed (orch 67 / api 82, unchanged counts — inside existing functions).
- [x] Existing 20 mislabelled cases re-resolved/cleaned; `remaining_mislabelled = 0` live.
- [ ] Live-occurrence probe: the next real PCH/QDOS audit email resolves its provider at intake
      (PCH via domain; QDOS via content or, once seeded, domain) — ties to [[TKT-056]] step-6.
- [ ] QDOS domain(s) supplied + seeded (operator).
