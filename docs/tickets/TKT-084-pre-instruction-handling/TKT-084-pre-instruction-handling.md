---
id: TKT-084
title: Pre-instruction directions email unidentified — define a handling lane
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-006, TKT-023]
research-link: docs/tickets/TKT-084-pre-instruction-handling/evidence/operator-note.md
---

# Pre-instruction directions email unidentified — define a handling lane

## Problem

The email "New claim - Mrs Mihaela Ioana Rus - SA61 JXB" shows as **unidentified**. It contains
**directions for us to follow prior to receiving official instructions** — a "pre-instruction"
email: not yet an instruction (no case should be minted), but not noise either. The taxonomy has
no lane for it, so it falls into `unidentified` and the directions are lost. The operator asks
for consideration of how this class is to be handled.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note.
- `evidence/New claim - Mrs Mihaela Ioana Rus - SA61 JXB.eml` — the sample email.
- The partial-case domain rule already exists for the *attachment* dimension (cases can arrive
  partial and are held with a chaser workflow); pre-instruction is the analogous *timing*
  dimension with no taxonomy home.

## Proposed change

PROPOSED (not built — includes a taxonomy design the operator must sign off):

- Design a `pre_instruction` lane in the taxonomy (subtype under `receiving_work` or a holding
  category): capture sender, client name, VRM, and the directions text; **no case minted** until
  the official instruction arrives.
- On the later official instruction, correlate back (VRM/client match — the TKT-023 ref-gate
  machinery) and surface the held directions on the new case.
- Propose the concrete handling (queue placement, chaser behaviour, retention if no instruction
  ever arrives) to the operator as a short options note **before** building; implement the chosen
  option behind a `TRIAGE_*`-style gate consistent with the rules-engine-v2 pattern.
- Add the sample to the eval corpus once the target label exists.

## Acceptance

- [ ] Operator has signed off the proposed handling (recorded in this folder).
- [ ] The sample `.eml` classifies into the new pre-instruction lane (not `unidentified`) in the
      eval corpus; no case row is created at that point.
- [ ] A subsequent matching instruction surfaces the held pre-instruction directions on the case
      (test at the correlation layer).
- [ ] Full prior eval corpus green.

## Verification requirements (proof standard — all classes required before `done`)

1. **Operator sign-off** — the handling-options note + the operator's choice recorded in
   [evidence/](./evidence/) before the build.
2. **Offline eval** — sample pinned to the new lane; full prior corpus green; recorded in
   [verification.md](./verification.md).
3. **Gate + deploy** — `node verify-all.mjs` green; taxonomy DDL delta (if any) + deploys +
   gate value recorded in [changes.md](./changes.md).
4. **Live probe** — replay the sample; prove via Postgres it lands in the new lane with the
   directions retained and no case minted.

## Research

Distilled 2026-07-06 from the operator drop-note folder
`to-distill/email-mistags/pre-instruction/`; raw material in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
