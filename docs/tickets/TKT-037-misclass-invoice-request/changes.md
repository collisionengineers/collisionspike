# Changes — TKT-037: Invoice request misclassified as new case
## Status
done — live-probed against the deployed engine 2026-07-02; locked in as an eval-corpus regression pin.
## Commits
- No code change required — the deterministic classifier's `billing`/`billing_request` rule already
  recognises the "please provide the invoice" body cue + prior-report attachment.
- 2026-07-02 — rules-engine-v2 Phase 0/1 evidence pass: live-probed the evidence email against the
  deployed `/classify-email` route; result recorded as an eval-corpus regression pin (manifest id
  `tkt037-invoice-request`, `scripts/eval-email/`). See [verification.md](./verification.md).
## Summary
A provider's invoice request for completed work ("Please provide the invoice", with our prior report attached)
was classified as a new case; the classifier needs an invoice/billing-request signal. Part of the
email-classification cluster (relates TKT-006).
