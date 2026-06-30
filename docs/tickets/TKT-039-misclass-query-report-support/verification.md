# Verification — TKT-039: Report-support request misclassified as new case
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro email in evidence/ (`Client Mrs Ruby Wiggett, Vehicle VOLKSWAGEN T-ROC LIFE TSI S-A DF72LVV, Our Ref
45391_1.eml`, plus attachment `EngineersReport-V1.pdf`). No build yet.
## Pending / gaps
Classifier rule needed: detect requests for support/arguments/justification on an existing report (existing
"Our Ref" + attached Collision Engineers report) and route to query handling rather than new-case.
## How to re-verify (once built)
Re-intake the sample .eml; confirm it routes to query (against the existing case), not a new case.
