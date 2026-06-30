# Verification — TKT-031: Client report-chaser misrouted to 'Other'

## Verdict
NOT YET IMPLEMENTED

## Evidence
Repro email(s) in evidence/ ((EREF12) RTA on 15_06_2026  Mr Daniel James Page (Our Ref SAB_46286_1, Vehicle HN13XMO).eml). No build yet.

## Pending / gaps
Classifier needs a rule that recognises chase emails carrying existing-job identifiers (client/own ref, claimant name, registration) as queries on an existing job and routes them to the query category instead of falling through to "Other".

## How to re-verify (once built)
Re-intake the sample (EREF12) ... HN13XMO.eml; confirm it routes to the query category, NOT "Other".
