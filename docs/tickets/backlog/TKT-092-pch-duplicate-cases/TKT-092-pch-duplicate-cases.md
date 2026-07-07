---
id: TKT-092
title: PCH cases duplicating for no reason
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-051, TKT-021, TKT-087]
research-link: docs/tickets/backlog/TKT-092-pch-duplicate-cases/evidence/operator-note.md
---

# PCH cases duplicating for no reason

## Problem

Operator: "PCH cases seem to be duplicating for no reason." PCH (Performance Car Hire) intake is
producing duplicate case rows for what should be one case. Duplicate cases split the evidence and
email trail, double the Case/PO consumption, and risk double EVA submissions.

Candidate vectors to investigate (not conclusions):

- **Multi-mailbox double-intake** — the same email arriving via more than one of
  info@/engineers@/desk@ and being ingested once per mailbox.
- **Graph redelivery** — `graph-webhook` 499/cold-start aborts are absorbed by Graph retries;
  if processing partially completed before an abort, the retry may create a second case.
- **Dedup key misses on PCH specifically** — PCH mail often routes via the Connexus intermediary
  (TKT-021/TKT-051): if provider/VRM/ref resolution differs between two deliveries of the same
  email, the dedup key may not match.
- **Follow-up-as-new-work misclassification** — a chaser/update on an existing PCH case minting
  a fresh case (the TKT-082 failure shape).

The 18 × Box `409` upload conflicts on 2026-07-03 (TKT-087) are a possible fingerprint of the
same double-processing — correlate the two.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note (no case ids supplied — enumerate them from
  the DB as step one).
- Live data: duplicate PCH cases exist in Postgres (same VRM/client/ref under distinct case ids).
- Prior PCH identification work: [TKT-051](../../verify/TKT-051-pch-connexus/TKT-051-pch-connexus.md),
  [TKT-021](../../verify/TKT-021-connexus-intermediary/TKT-021-connexus-intermediary.md).

## Proposed change

PROPOSED (not built):

- **Enumerate**: a Postgres sweep listing duplicate case groups (same VRM ± client/ref) for PCH
  — and all providers, to see whether this is PCH-specific.
- **Trace one duplicate pair end-to-end** (audit rows, source `inbound_email`, mailbox,
  Graph message ids, timestamps) to name the vector.
- **Fix the vector**: idempotency key on intake (e.g. Graph internet-message-id + dedup by
  VRM/ref against open cases) so redelivery/multi-mailbox arrivals converge on one case.
- **Data fix**: audited merge/void of existing duplicate pairs (respecting the merge
  provider-loss bug TKT-052 — don't lose the provider while merging).

## Acceptance

- [ ] The duplicate groups are enumerated and the causal vector is named with trace evidence.
- [ ] The same email (redelivered or multi-mailbox) can no longer create two cases — regression
      test at the intake/dedup layer.
- [ ] Existing duplicates are merged/voided by an audited fix, evidence and emails re-pointed at
      the surviving case, provider preserved.
- [ ] A fresh PCH intake creates exactly one case (live probe).

## Verification requirements (proof standard — all classes required before `done`)

1. **Data audit** — the duplicate-group sweep (before) + the post-fix sweep (after: zero
   unexplained duplicates), recorded in [verification.md](./verification.md).
2. **Trace evidence** — the end-to-end trace of at least one duplicate pair naming the vector.
3. **Offline tests** — intake idempotency/dedup regression tests green.
4. **Gate + deploy** — `node verify-all.mjs` green; orch/api deploys recorded in
   [changes.md](./changes.md).
5. **Live probe** — one live (or replayed) PCH email → exactly one case; a deliberate redelivery
   of the same message → still one case.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/pch-duplicates/`; raw
material in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
