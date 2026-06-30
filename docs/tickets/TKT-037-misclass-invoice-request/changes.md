# Changes — TKT-037: Invoice request misclassified as new case
## Status
Distilled 2026-06-30 from spike-tickets-to-distill/miscategorised-emails; not yet built.
## Commits
- No code changes yet.
## Summary
A provider's invoice request for completed work ("Please provide the invoice", with our prior report attached)
was classified as a new case; the classifier needs an invoice/billing-request signal. Part of the
email-classification cluster (relates TKT-006).
