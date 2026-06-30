# Verification — TKT-029: Case-summary email misclassified as new case

## Verdict
NOT YET IMPLEMENTED

## Evidence
Repro email(s) in evidence/ (New inspection requests.eml + Credit_Repair_Engineer_Instruction_46203.2087640856.pdf). No build yet.

## Pending / gaps
Classifier needs a rule that detects a summary/digest of already-received cases (enumerates multiple cases, recap-style subject) and routes it to a query / non-actionable category instead of `new case`, suppressing Case/PO mint and intake.

## How to re-verify (once built)
Re-intake the sample New inspection requests.eml; confirm it routes to a query / non-actionable category and does NOT create a new case.
