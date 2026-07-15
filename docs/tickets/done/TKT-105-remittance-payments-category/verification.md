# Verification — TKT-105: Remittance advice classified under payments/billing

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
- Live `/classify-email` on the sample returns a payments/billing category (not new work).
- Eval-corpus regression pin added.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. The remittance sample classifies billing/payment_remittance live (taxonomy v3) with the payments lane beating the instruction-doc promotion that pre-fix minted a case; pin tkt105-remittance-advice green (payment_remittance 2/2; the invoice-REQUEST lane untouched 1/1); the SPA E-mail-type dropdown renders the Billing group with handler-plain "Payment received". Recorded limit (fails safe): auto-reply-marked remittances abstain at Rule 0. Registry-trusted: the 100000013 code-table row (delta recorded applied; live taxonomy_version 3 + SPA plumbing corroborate).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
