# Verification — TKT-038: Bare acknowledgement ('Thanks Ed') misclassified as query
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro email in evidence/ (`RE Client Mrs Ruby Wiggett, Vehicle VOLKSWAGEN T-ROC LIFE TSI S-A DF72LVV, Our Ref
45391_1.eml`) — body is just "Thanks Ed". No build yet.
## Pending / gaps
Classifier rule needed: a low-content / acknowledgement filter so a short pleasantry reply with no question or
request is not classified as a query, without suppressing replies that thank and also ask something.
## How to re-verify (once built)
Re-intake the sample .eml; confirm it routes to acknowledgement / no-action, not a query.
