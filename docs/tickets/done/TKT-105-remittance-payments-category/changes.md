# Changes — TKT-105: Remittance advice classified under payments/billing

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Root cause (confirmed by direct run):** the real remittance email promoted to
`receiving_work/existing_provider_instruction` at Rule 1 — the remittance PDF's extension-derived
attachment kind is "instruction" and the sender matched a provider, so a PAYMENT NOTICE would have
minted a case. (The old design deliberately abstained remittances to `other`; the operator's
direction is a payments/billing lane.)

**Shipped (sibling-first, engine-v2.10, re-vendored):**
- **Taxonomy v3**: new subtype `payment_remittance` under the existing `billing` category
  (classifier `SUBTYPE_PAYMENT_REMITTANCE`; `TAXONOMY_VERSION` 2→3). Full plumbing: TS
  `InboundSubtype`/`INBOUND_SUBTYPES` (@cs/domain), code-table JSON code **100000013**, api
  name↔code maps, SPA label "Payment received" under Billing, DDL delta
  `2026-07-09-taxonomy-v3-pre-instruction-payments.sql` (APPLIED live BEFORE the parser deploy).
- **Rule 0d** (`payment_remittance`): a new `payment_phrases` collection (triage-rules.json, 14
  anchored payment-statement phrases — "remittance advice", "funds will be in your", transfer
  wording…) fires sender-scoped AFTER cancellation and BEFORE the Rule-1 instruction-doc promotion;
  ref present bands confidence up. `billing_request` (the request direction, TKT-037) is untouched —
  a guard test pins that an invoice REQUEST still routes `billing_request`.
- Corpus relabel: the synthetic `tier2 other/unrelated-admin.eml` (literally a remittance advice
  under the old abstain) moved to `billing/remittance-advice.eml`, expected
  `billing/payment_remittance`; the repo guard test `test_remittance_advice_is_not_billing` rewritten
  to assert the NEW lane (still never `billing_request`).

**Eval:** pin `tkt105-remittance-advice` (the REAL .eml + PDF evidence); payment_remittance 2/2;
corpus 87.9%, `--check` clean.

**Deploys/probes:** DDL delta verified live (100000013), parser engine-v2.10 + api + SPA deployed;
live probe 1 (`Remittance advice` + instruction-kind attachment) returned
`billing/payment_remittance` with `payment_keywords` signals (2026-07-09).

**Remainders:** KNOWN LIMIT documented in-code — an automated remittance whose footer trips an
auto-reply marker ("do not reply") still abstains at Rule 0 before reaching 0d.
