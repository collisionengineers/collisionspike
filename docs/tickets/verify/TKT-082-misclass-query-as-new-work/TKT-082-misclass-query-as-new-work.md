---
id: TKT-082
title: Existing-case query misclassified as new client work
status: verify
priority: P1
area: email
tickets-it-relates-to: [TKT-030, TKT-033, TKT-046, TKT-023]
research-link: docs/tickets/verify/TKT-082-misclass-query-as-new-work/evidence/operator-note.md
---

# Existing-case query misclassified as new client work

## Problem

Two email threads about a case instructed **28/04/26** were tagged **new client work**
(`receiving_work`/`new_client_work`) when they are queries on that existing case:

- **sample-1** — "Client Mr Anthony Mohammed Cauchie __ Engineer Instruction - VRN GM23 KPZ" (+
  `GM23KPZ.pdf`). Instruction-flavoured wording, but the case already exists — this is a
  follow-up/query, not a fresh instruction.
- **sample-2** — "Re (EREF1) Mr Paul Tasker … (Our Ref __46587_1, Registration NA68 FMU)" (two
  `.eml`s from the same thread).

Misrouting queries into the new-work lane risks duplicate case creation (the inverse of TKT-030's
chaser-as-new-work problem) and hides the query from the existing case's activity.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note (identical on both samples).
- `evidence/sample-1/` — Cauchie `.eml` + `GM23KPZ.pdf` + original `info.md`.
- `evidence/sample-2/` — the two Tasker thread `.eml`s + original `info.md`.
- The generalised ref-gate (`TRIAGE_REF_GATE_ENABLED`) has been ACTING live since 2026-07-03
  ([TKT-023](../../now/TKT-023-follow-up-docs/TKT-023-follow-up-docs.md)) — these samples show threads
  it does not catch (Re/EREF prefixes, VRM matching an open case). Verify current gate state
  against the registry before acting.

## Proposed change

PROPOSED (not built):

- Strengthen the existing-case correlation ahead of the new-work lane: when the VRM, client name,
  or provider ref in the email matches an **open case**, prefer `query_existing_work` /
  `case_update` over `new_client_work` — even when instruction wording is present (an instruction
  for a VRM we already hold open is a follow-up, not new work).
- Treat `Re:`/`RE:`-chain subjects as a strong prior against `new_client_work`.
- Add both threads to the eval corpus as regression pins; verify the dedup/twin guard would have
  blocked a duplicate case for GM23 KPZ / NA68 FMU.

## Acceptance

- [ ] Both sample threads classify as a query/update on the existing case (not
      `receiving_work`/`new_client_work`) in the eval corpus.
- [ ] An email matching an open case by VRM or ref does not create a second case (regression
      test on the intake path).
- [ ] Genuine new instructions (no matching open case) still classify `new_client_work` — full
      prior eval corpus green.

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline eval** — both threads added to the committed eval corpus and passing; full prior
   corpus green; outputs recorded in [verification.md](./verification.md).
2. **Gate + deploy** — `node verify-all.mjs` green; deploys recorded in [changes.md](./changes.md).
3. **Live probe** — replay one sample through the deployed stack; prove via Postgres that it is
   tagged query/update and linked (or suggest-linked) to the existing case, with no new case row.
4. **Recall guard** — a genuine new-instruction email still creates a case post-deploy.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/email-mistags/case-query/`;
raw material in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- Sample notes: [sample-1](./evidence/sample-1/info.md) · [sample-2](./evidence/sample-2/info.md)
