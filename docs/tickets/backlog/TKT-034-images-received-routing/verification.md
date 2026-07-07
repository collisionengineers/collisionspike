# Verification — TKT-034: Inbound images: match to case / create Box folder by reg / flag

## Verdict
NOT YET IMPLEMENTED

## Evidence
Repro email(s) in evidence/ (RE Re127581.001_Mr E Taullaj.eml). No build yet.

## Pending / gaps
Needs: (1) split the single "query" category into Enquiries vs Case Queries; (2) an image-received handler with the 3-step fallback — match to existing case by claimant name / prior emails / client ref (not Case/PO), else create a registration-keyed Box folder when a reg is viewable, else flag the email. The sample has no match and no viewable reg, so it must land on the flag step.

## How to re-verify (once built)
Re-intake the sample RE Re127581.001_Mr E Taullaj.eml; confirm it is recognised as receiving images and, with no case match and no viewable registration, lands on the flag step rather than being silently classed as a generic query.
