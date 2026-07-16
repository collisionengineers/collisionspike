---
id: TKT-219
title: Run Box and Outlook retro locates in parallel and combine findings, widen triggers, and split dev/live Case-PO adoption
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-058, TKT-119, TKT-139, TKT-140, TKT-021, TKT-004, TKT-178]
research-link: docs/tickets/verify/TKT-219-retro-parallel-reconstruction/evidence/operator-note.md
plan: PLAN-004
---

# Run Box and Outlook retro locates in parallel and combine findings, widen triggers, and split dev/live Case-PO adoption

## Problem

The retro reconstruction ladder (ADR-0022 / TKT-058) runs Box strictly before Outlook. A Box folder
with nothing parseable degrades to a data-empty Held `minimal` anchor and the Outlook rung never
runs — even when the original instruction survives in a mailbox. Emails classified `other` (the
largest live refusal bucket: 34 of 46 `retroDecision attempt:false` in the 72h to 2026-07-16) never
attempt retro at all. The Box content search cannot use a claimant name; the Outlook `$search` takes
one 25-item page of sent-date-sorted results so an old original can be silently missed (current
Microsoft Learn semantics: up to 1,000 results, default page 10, no `$orderby` with `$search`).
Retro `classifyPersist` calls omit `caseVrm`/`workProviderId`, so the per-provider AI opt-out is not
honoured on retro runs; `extractImages` never runs on reconstructed originals; the located
intermediary match (TKT-021) is not threaded into `applyParserFields`; the manual-drain
`trigger_not_found` path leaves rows un-cased and un-stamped (19 such rows in TKT-140); and retro
adopts a discovered archive folder name verbatim as `case_po`, which is wrong for dev/test where
Case/PO alignment is not true to live.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — operator directives, 2026-07-16.
- [evidence/investigation-2026-07-16.md](./evidence/investigation-2026-07-16.md) — four-agent
  investigation: live-state verification (retro live, Box rung config-dark), Box/Outlook parity
  trace (gaps G1–G7), Microsoft Learn `$search` verification, dual-search cost assessment
  (monetary delta ≈ $0; constraints are throttle shape and free-tier telemetry retention).
- TKT-140 drain evidence: 19 `trigger_not_found` rows un-stamped; 13 junk-key shapes withheld
  manually with no code guard.

## Proposed change

1. **Parallel locate + combined reconstitution.** `retroResolveExisting` stays first and
   sequential; then fan out `retroBoxLocate` + `retroOutlookLocate` concurrently
   (`ctx.df.Task.all`). Combine via a pure `planRetroReconstruction` helper: Box source wins when
   parseable; a Box folder with nothing parseable plus a corroborated Outlook original becomes a
   COMBINED create (Outlook source material + Box identity, contradiction demotes to minimal
   anchor as today); Box-arm `refused_category` falls back to the in-hand Outlook result; neither
   → failure record. Concurrency bounds: ≤3 `$search` variants per mailbox concurrently, pages
   sequential within a variant, ≤3 concurrent Box content-searches per attempt.
2. **`other` becomes a locate-only retro trigger** (the TKT-119 acknowledgement pattern): may link
   or reconstruct a found original, never self-anchor (`other` stays in the blocked-original
   list). Companion junk-key guard: a pure predicate rejects the 13 TKT-140 junk-key shapes
   before any search.
3. **Claimant-name search key**: derived from the trigger body via the existing
   `supplementClaimantNameFromBody`; added to `RetroKeys`/`decideRetro` and to the Box content
   search + Outlook `$search` ladders as the weakest tier; claimant-only folder picks require
   provider corroboration (the ADR-0010 discipline, as VRM-only does today).
4. **Outlook paging**: page size 250, follow `@odata.nextLink` to a ≤1,000 hard cap per
   mailbox×variant, log truncation; fix the stale "25 relevance-ranked" comment.
5. **Intake parity**: retro `classifyPersist` carries `caseVrm` + `workProviderId` (honours the
   per-provider AI opt-out); `extractImages` runs for reconstructed originals; the trigger's
   intermediary match threads through `retroCreatePersist` → `retro/create` → `applyParserFields`.
6. **`trigger_not_found` stamping**: the manual-drain path records the failure and stamps
   `unable_to_locate` instead of returning silently.
7. **Dev/live Case-PO split**: new fail-closed gate `RETRO_ADOPT_ARCHIVE_PO_ENABLED`. Unset
   (dev/test): retro creates mint via the normal allocator and record the discovered archive PO as
   `case_ref` + note + audit only. `'true'` (post-cutover): adopt the folder name verbatim
   (today's behaviour). The cutover flip is documented by TKT-221.

## Acceptance

- Generator-style orchestrator tests prove: Box+Outlook locates dispatch in one parallel fan-out
  after `retroResolveExisting`; each single-gate-off asymmetry preserves the other rung; the
  combined arm (Box folder + nothing parseable + corroborated Outlook original) creates with Box
  identity and Outlook material; ref/VRM contradiction demotes to the minimal anchor; a Box-arm
  `refused_category` falls back to the in-hand Outlook result without re-search.
- Domain tests prove: `other` + usable key attempts retro; `other` stays refused as a create
  anchor; every one of the 13 TKT-140 junk-key shapes is rejected by the guard and produces no
  search; claimant-only keys attempt and carry provider-corroboration requirements.
- A unit test proves `searchMessages` follows `@odata.nextLink` to the cap and logs truncation.
- Tests prove retro `classifyPersist` inputs carry `caseVrm`/`workProviderId`, `extractImages` is
  invoked for a reconstructed original with attachments, and `retro/create` forwards the
  intermediary match into `applyParserFields`.
- Route tests prove both `RETRO_ADOPT_ARCHIVE_PO_ENABLED` modes: default-off mints normally and
  records the discovered PO as `case_ref` + note (never `case_po`); gate-on stores the discovered
  PO verbatim exactly as today.
- The manual-drain `trigger_not_found` path stamps `unable_to_locate` (test or recorded live
  evidence).
- Live: both apps deployed; `RETRO_BOX_ARCHIVE_ROOT_IDS` set on cespk-orch-dev (operator-approved
  2026-07-16); one drained email shows `rungsTried` containing `box_archive` and a
  created/linked/visible-failure outcome recorded in verification.md.

## Research

Distilled 2026-07-16 from the operator directives and the same-day four-agent investigation (see
Evidence). Cost assessment: the dual search is not a monetary concern (≈$0 delta); bounds exist
for throttle shape only.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Investigation](./evidence/investigation-2026-07-16.md)
