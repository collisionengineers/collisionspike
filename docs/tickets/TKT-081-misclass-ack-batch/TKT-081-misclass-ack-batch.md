---
id: TKT-081
title: Acknowledgement emails still misclassified — tagged as query/new case, one opened a blank case
status: backlog
priority: P1
area: email
tickets-it-relates-to: [TKT-038, TKT-006]
research-link: docs/tickets/TKT-081-misclass-ack-batch/evidence/operator-note.md
---

# Acknowledgement emails still misclassified — tagged as query/new case, one opened a blank case

## Problem

Four fresh acknowledgement emails (dropped 2026-07-06, post-dating the TKT-038 fix that was
verified live 2026-07-02) are still misclassified by the deployed classifier:

- **sample-1** (RE Mr Abu Zaid Rasool - PE19UDH) — bare ack tagged **case query**.
- **sample-2** ("Thank you for your email") — ack tagged **new case**, and a **blank case was
  opened with zero details**. This is the severe half: a non-actionable email minted a case.
- **sample-3** (RE RE Re RE RTA135600.001 - Mr G Pashapour - WG19 SFU) — "No problem and thank
  you for this / Kind regards" tagged **Query / Case Query**.
- **sample-4** (RE (EREF31) … Mr Mujibur Ali - BE11 MUJ) — ack tagged **case query**.

TKT-038 fixed the *bare* "Thanks Ed" shape; these four show acks wrapped in reply chains with
case references/VRMs in the subject still leak into `query`/`receiving_work`. The
reference-bearing subject appears to outvote the acknowledgement body.

## Evidence

- `evidence/operator-note.md` — aggregated verbatim drop-notes.
- `evidence/sample-1/…4/` — the four `.eml` files plus each sample's original `info.md`.
- Live behaviour per the operator: tags as above; sample-2 additionally created a blank case
  (find and clean it as part of the data fix — search `case_` rows created from that email's
  intake around its received date).
- Prior fix + eval pin: [TKT-038](../TKT-038-misclass-query-ack/TKT-038-misclass-query-ack.md)
  (`non_actionable`/`acknowledgement`, verified live 2026-07-02).

## Proposed change

PROPOSED (not built):

- Extend the classifier's acknowledgement detection to reply-chain acks: a short
  gratitude/confirmation body ("no problem", "thank you for this", "received, thanks") should
  classify `non_actionable`/`acknowledgement` even when the subject carries refs/VRMs/RE-chains.
- Ensure `non_actionable` **never creates a case** — audit the intake path that opened the blank
  case on sample-2 and add a guard + regression test (case creation only for `receiving_work`
  lanes).
- Add all four samples to the committed eval corpus as regression pins.
- Audited data fix: remove/void the blank case sample-2 opened (respecting the TKT-010 soft-remove
  pattern), with the audit row recorded.

## Acceptance

- [ ] All four sample `.eml`s classify `non_actionable`/`acknowledgement` in the eval corpus.
- [ ] No case row is created when a `non_actionable` email is ingested (regression test).
- [ ] The blank case opened by sample-2 is located and removed/voided with an audit trail.
- [ ] The full existing eval corpus still passes (no recall regression on query/new-work lanes).

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline eval** — the committed eval corpus extended with the four samples, all passing, plus
   the full prior corpus green; outputs recorded in [verification.md](./verification.md).
2. **Gate + deploy** — `node verify-all.mjs` green; parser/orch deploy recorded in
   [changes.md](./changes.md).
3. **Live probe** — replay at least one of the four samples through the deployed stack and prove
   via Postgres (`inbound_email.suggested_category/subtype`) it lands
   `non_actionable`/`acknowledgement` and **no case row** is created.
4. **Data-fix proof** — before/after query showing the sample-2 blank case removed/voided, with
   its audit row.
5. **Recall guard** — a genuine query email and a genuine instruction email still classify
   correctly post-deploy (live or replayed).

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/email-mistags/acknowledgement/`
(four samples); raw material in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- Sample notes: [sample-1](./evidence/sample-1/info.md) · [sample-2](./evidence/sample-2/info.md) · [sample-3](./evidence/sample-3/info.md) · [sample-4](./evidence/sample-4/info.md)
