# Verification — TKT-036: Work-instructions email misclassified as query
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro email in evidence/ (`Our Ref 206848.001 - Kassar Saeed - New eng ins.eml`, plus attachment
`To Engineer with instructions.DOC`). No build yet.
## Pending / gaps
Classifier rule needed: recognise an instructions-style attachment and/or instruction subject cues
("instructions", "eng ins") as an instructions / new-case signal rather than a query.
## How to re-verify (once built)
Re-intake the sample .eml; confirm it routes to instructions / work-to-do, not query.
