---
id: TKT-105
title: Remittance advice classified under payments/billing
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-037, TKT-006]
research-link: docs/tickets/backlog/TKT-105-remittance-payments-category/evidence/operator-note.md
---

# Remittance advice classified under payments/billing

## Problem

Remittance-advice emails (a provider notifying CE of a payment made, with a remittance PDF) have no
explicit classification home. They should fall under a **payments/billing** category — a sibling of the
invoice/billing work in TKT-037 (invoice request), but the *inbound payment notification* direction.
(This note sat in the operator's `to-distill/done/` area but was never actually distilled into a ticket.)

## Evidence

- `evidence/operator-note.md` — "Remittance advice — falls under payments".
- `evidence/Remittance advice.eml` — the remittance email.
- `evidence/P43684 - Collision.pdf` — the remittance advice PDF.

## Proposed change

PROPOSED (not built):
- Ensure remittance-advice emails classify under the payments/billing taxonomy (not `new_client_work`):
  detect remittance-advice language + the payment PDF, route to payments.
- Add the sample to the email eval corpus as a regression pin.

## Acceptance

- Live `/classify-email` on the sample returns a payments/billing category (not new work).
- Eval-corpus regression pin added.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/done/remittance/` (the one `done/`-area item that
had no existing ticket); raw material in [evidence/](./evidence). Sibling of
[TKT-037](../../done/TKT-037-misclass-invoice-request/TKT-037-misclass-invoice-request.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
