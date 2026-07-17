---
id: TKT-224
title: Re-classify historically mislabeled un-cased emails after classifier fixes
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-083, TKT-219, TKT-158, TKT-185, TKT-194, TKT-140]
research-link: docs/tickets/backlog/TKT-224-reclassify-stale-abstains/TKT-224-reclassify-stale-abstains.md
plan: PLAN-004
---

# Re-classify historically mislabeled un-cased emails after classifier fixes

## Problem

Classifier fixes are forward-only: stored triage labels are written once at ingestion and never
re-evaluated when the engine improves. Root-caused live 2026-07-16: a Fairway instruction email
(one work phrase + ref + VRM, no attachment) was labeled `other` by the pre-TKT-083 engine and
still carries that label — blocking the WF69NDX retro reconstruction at the anchor guard even
though the CURRENT engine classifies the shape correctly. ~200 un-cased rows sit in the same
abstain band and may carry similar stale verdicts.

## Proposed change

PROPOSED (not built) — a drain-style, dry-run-first remediation sweep (the TKT-140 pattern):
- Scope: `inbound_email` rows with `case_id IS NULL AND classifier_mode <> 'human'` in the
  abstain band (category `other`, confidence <= 0.3, or `rule:abstain_to_other` in signals).
  Staff labels are NEVER touched (`classifier_mode='human'` is the existing marker).
- Per row: re-fetch from Graph by `source_message_id` (existing fetch machinery), re-run the
  CURRENT deterministic `classify_email`, compare old vs new label.
- Dry-run ledger first (old→new per row, zero writes) → operator review → apply pass updating
  changed labels with one audit row per change (engine version old→new, rule fired, provenance
  `engine_remediation`). Rows that become `receiving_work` do NOT auto-mint; rows that become
  retro-trigger categories are flagged as re-drain candidates for a follow-up forced drain.
- Eval fixture: add the live 2026-07-16 sample (content-addressed) pinned as
  `receiving_work/existing_provider_instruction` at `provider_match_state: one`.
- Process rule (classifier PROVENANCE/eval README): every classifier-fix ticket must state
  whether historical rows need remediation — run the sweep or record why not.
- Prerequisite check: confirm `upsertInboundEmail`/`recordInboundEmail` category-overwrite
  semantics before the apply pass design is frozen.

## Acceptance

- Dry-run ledger over the abstain band reviewed by the operator; apply pass audited per row;
  zero `classifier_mode='human'` rows modified (asserted in the ledger).
- The 2026-07-16 sample email is re-labeled by the sweep (or by prior staff reclassify — then
  proven unchanged by it), and the eval corpus carries its fixture with
  `run_eval.py --check baseline-v2.json` clean.
- Re-drain candidates flagged in the ledger convert or fail visibly on the follow-up drain.
- The process rule is committed and referenced from the eval README.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
