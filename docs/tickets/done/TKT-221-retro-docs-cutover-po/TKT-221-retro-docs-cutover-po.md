---
id: TKT-221
title: Document the retro Case-PO cutover flip, correct retro ADR/spec drift, and register the retro gates
status: done
priority: P2
area: docs
tickets-it-relates-to: [TKT-219, TKT-178, TKT-004, TKT-119, TKT-139, TKT-058]
research-link: docs/tickets/verify/TKT-219-retro-parallel-reconstruction/evidence/investigation-2026-07-16.md
plan: PLAN-004
---

# Document the retro Case-PO cutover flip, correct retro ADR/spec drift, and register the retro gates

## Problem

TKT-219 splits retro Case/PO behaviour by environment behind `RETRO_ADOPT_ARCHIVE_PO_ENABLED`
(dev/test mints via the normal allocator; live adopts the archive folder name verbatim). The
production cutover documentation must record the flip — what the gate changes, that TKT-004 floor
seeding must precede it, the floors-ahead no-conflict rationale, and that retro-adopted POs feed
the per-prefix floor calculation (TKT-178 A19). Separately, retro documentation has drifted from
verified reality: TKT-119's acceptance wording ("an acknowledgement/query email can never mint a
case") contradicts the shipped-and-intended behaviour for the query/update trigger family; the
retro orchestrator header still claims "[R3 — not built]"; ADR-0022 does not enumerate the
blocked-original categories; the pinned Graph `$search` semantics ("25 relevance-ranked") are
wrong per current Microsoft Learn (up to 1,000 sent-date-sorted results, default page 10,
attachment names only — content is unreachable); and LIVE_FACTS.json does not register the RETRO_*
gates at all.

## Evidence

- [Investigation, 2026-07-16](../../verify/TKT-219-retro-parallel-reconstruction/evidence/investigation-2026-07-16.md)
  — live gate readings (dated, read-only az) and the Microsoft Learn verification table.
- [Operator note](../../verify/TKT-219-retro-parallel-reconstruction/evidence/operator-note.md) — directive 4
  (cutover-guide documentation requirement).

## Proposed change

PROPOSED (not built):
- Add the retro Case/PO adoption flip to the production cutover documentation (the TKT-178
  runbook context and the operations pages): gate name, when to flip, prerequisite (TKT-004
  floors seeded), rationale, and floor-feed note.
- Correct ADR-0022: enumerate the blocked-original categories + rationale; record the verified
  `$search` semantics and the attachment-content blind spot; note the parallel-ladder change made
  by TKT-219.
- Add a dated clarification to TKT-119 (acceptance wording vs shipped behaviour).
- Delete the stale "[R3 — not built]" header line (code comment fix, rides with TKT-219 deploy).
- Register `RETRO_CASE_ENABLED`, `RETRO_OUTLOOK_SEARCH_ENABLED`, `RETRO_BOX_ARCHIVE_ROOT_IDS`, and
  `RETRO_ADOPT_ARCHIVE_PO_ENABLED` in LIVE_FACTS.json with the dated 2026-07-16 az evidence.

## Acceptance

- The cutover documentation names the gate, its prerequisite and rationale, and is reachable from
  the TKT-178 material.
- ADR-0022 reflects the blocked-original list, the verified `$search` semantics, and the parallel
  ladder.
- TKT-119 carries the dated clarification; the stale header comment is gone.
- LIVE_FACTS.json registers the four retro gates with dated evidence and passes
  `check-tickets`/`check-doc-links`.

## Research

Distilled 2026-07-16 from the operator directive and the same-day investigation evidence.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
