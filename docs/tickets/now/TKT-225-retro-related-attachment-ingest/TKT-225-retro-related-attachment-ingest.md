---
id: TKT-225
title: Parse retro-linked related correspondence into the case — attachments become evidence, details fill the gaps
status: now
priority: P1
area: intake
tickets-it-relates-to: [TKT-222, TKT-219, TKT-220, TKT-223, TKT-058]
research-link: docs/adr/0022-retroactive-case-reconstruction.md
plan: PLAN-004
---

# Parse retro-linked related correspondence into the case — attachments become evidence, details fill the gaps

## Problem

TKT-222 links every related mailbox email to a reconstructed retro case, but as SKINNY rows only
(`body:''`, `attachments:[]`): no evidence rows, no parser fields, no images. A reconstructed case
can therefore be missing claimant details, references, documents, and photos that sit in the
attachments of the very emails the backfill just linked. Operator directive 2026-07-16: "the
initial retro construction — this is basically like receiving a new case, so attachments need to be
parsed for details if we don't have them."

## Change

Gated `RETRO_RELATED_INGEST_ENABLED` (orchestration app only; default off = TKT-222 v1 behaviour,
byte-identical):

- `retroLinkRelated` activity result gains `ingestRows` (present ONLY when the gate is on — the
  checkpointed gate decision), mapped from the extended link-related response: newly linked rows
  PLUS rows already linked to THIS case (heals the v1 link-only pile on a TKT-223 force re-run);
  rows linked elsewhere are never returned (never re-point). Sorted receivedAt ASC, capped
  (`RELATED_INGEST_CAP=25`, truncation logged).
- New child `retroRelatedIngestOrchestrator` (`retro-related-ingest.ts`): per row, sequential with
  per-row salvage — `fetchMessage` → `parse` → `classifyPersist` (new
  `bodyInstructionFallback:false` — a chaser body never mints an instruction row) →
  `extractImages` → `retroBackfillFields` (skipped when the parse contradicts the case keys —
  `relatedParseContradictsKeys`, the demotion rule shared with the Outlook-original arm); then one
  `statusEvaluate`.
- Data API: `POST /api/internal/retro/link-related` response gains `linkedIds`/`alreadyLinkedIds`
  (additive); new `POST /api/internal/retro/backfill-fields` wraps `applyParserFieldsUsing` with NO
  sender provider, NO intermediary, NO recoveryContext (fill-gaps only — no Case/PO mint, no
  provider-recovery completion), plus a VRM fill-if-empty (TKT-073 junk-guarded) with provenance.
- Parent wiring in `finishPersisted`: schedule the child on `ingestRows`, then re-run
  `boxArchiveEvidence` once on the Outlook-only arm's writable folder (D8); RO Box/combined arms
  stay untouched.
- ADR-0022 amendment paragraph (2026-07-16, related-correspondence ingest).

Out of scope: rung-1 related backfill, providerMatch on related senders, provider recovery /
Case-PO minting from related emails, Box mirroring on RO-root arms.

## Acceptance

1. After a gated-on reconstruction, every ingest-eligible linked related email has its attachments
   fetched, persisted as sha256-carrying evidence, embedded images extracted, and parser fields
   applied fill-gaps — with zero overwrites of already-set values (audit-proven).
2. Contradicted parses apply no fields but still persist evidence, with a logged reason.
3. A re-run (force drain) produces no duplicate evidence and all-noop field application; rows
   previously linked by TKT-222 v1 to the same case are healed with evidence on re-run.
4. Gate off = byte-identical behaviour to TKT-222 v1 (generator-test pinned).
5. Unit/generator/route tests green; live line: one drained case shows related-email evidence rows
   + ≥1 gap-filled field with provenance, recorded in `verification.md` with KQL excerpts.

## Research

Distilled 2026-07-16 from the operator directive and the ADR-0022 amendment of the same date; the
implementation plan was produced against the PR #102 branch (TKT-219/TKT-222 code in place).

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)
