# Verification — TKT-037: Invoice request misclassified as new case
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro email in evidence/ (`Your Ref kbs26067 __ Our Ref 303671 .eml`, plus attachment `Engineer Report.pdf`).
Body contains "Please provide the invoice". No build yet.
## Pending / gaps
Classifier rule needed: detect invoice/billing-request body cues ("please provide the invoice") plus an
existing "Our Ref" / attached prior Collision Engineers report, and route away from new-case handling.
## How to re-verify (once built)
Re-intake the sample .eml; confirm it routes to invoice / billing-request handling, not a new case.
