---
id: TKT-085
title: Registration on case A.PCH26003 logged as "OCTOBER" (VRM false positive)
status: backlog
priority: P1
area: parsing
tickets-it-relates-to: [TKT-071, TKT-065, TKT-056]
research-link: docs/tickets/backlog/TKT-085-vrm-false-positive-october/evidence/operator-note.md
---

# Registration on case A.PCH26003 logged as "OCTOBER" (VRM false positive)

## Problem

The live audit case **A.PCH26003** has its vehicle registration logged as **"OCTOBER"** — a month
word, not a plate. Like TKT-071 (`HD4110`), a wrong VRM poisons dedup/twin matching (VRM is the
primary correlation key, ADR-0002) and flows into EVA fields; on an audit case it also degrades
the audit-vs-instruction document pairing.

Note this is a **different shape** from TKT-071: `HD4110` matched the loose dateless rule
(`[A-Z]{1,3}\d{1,4}`); `OCTOBER` is all-alpha, so some other path accepted it — plausibly a
dateless/personalised-plate shape or a labelled-field extraction grabbing a date word near a
"registration" label in the audited report. Root cause must be established, not assumed.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note (the drop folder was named after the live
  case, `A.PCH26003`).
- Live data: case `A.PCH26003` in Postgres carries `vrm`/`candidate_vrm` = `OCTOBER` (probe to
  confirm which fields and to find the source document/email).
- VRM rules live dual-home: `packages/domain/src/domain/vrm-filter.ts` (TS) and the Python sniff
  in the `cedocumentmapper_v2.0` sibling (ADR-0018 — edit sibling first, then re-vendor).

## Proposed change

PROPOSED (not built):

- **Root-cause**: pull A.PCH26003's source documents/emails, find where `OCTOBER` was captured,
  and identify the accepting rule.
- **Rule fix**: add a month/day-word denylist (JANUARY…DECEMBER, MONDAY…SUNDAY) to the VRM
  filter, and/or tighten the accepting shape found in root-cause — in both the TS filter and the
  Python sniff, with the same fixtures in both suites (TKT-071's proximity-anchor work should be
  coordinated so the fixes compose).
- **Data fix**: an audited SQL update clearing the junk VRM on A.PCH26003 (and any other live
  rows carrying month/day-word VRMs — sweep the corpus for the same shape).

## Acceptance

- [ ] The A.PCH26003 source text extracts NO vrm (or the correct one, if a real plate exists in
      the documents) in both the TS filter and the Python sniff.
- [ ] Month/day words are rejected as VRM candidates (fixtures in both test suites).
- [ ] Every previously-accepted fixture in `vrm-filter.test.ts` (and the sibling suite) still
      passes.
- [ ] A.PCH26003 and any other affected live rows are cleaned by an audited delta; a corpus sweep
      shows zero month/day-word VRMs remain.

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline tests (dual-language)** — new rejection fixtures + full existing-acceptance
   regression green in both vitest and the sibling's Python suite; recorded in
   [verification.md](./verification.md).
2. **Gate + deploy** — `node verify-all.mjs` green; parser re-vendor commit + deploys recorded in
   [changes.md](./changes.md).
3. **Live replay** — re-parse the A.PCH26003 source document through the deployed stack and prove
   the extracted VRM is empty/correct.
4. **Data-fix proof** — before/after SQL counts (month/day-word VRM count → 0) plus the audit
   rows written by the delta.
5. **Recall guard** — a genuine-VRM document still extracts its registration post-deploy.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/A.PCH26003/`; raw material in
[evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
