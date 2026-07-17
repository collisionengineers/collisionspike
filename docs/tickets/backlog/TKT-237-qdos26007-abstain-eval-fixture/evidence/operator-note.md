# Operator note — QDOS26007 classifier eval fixture pin, approved 2026-07-16

## Incident

Live case QDOS26007 was wrongly MINTED from a provider query email quoting our own delivered
report ("Please provide the breakdown for the attached report", subject in QDOS instruction
format "(EREF33) RTA on 11/05/2026 : Miss K— H—" — claimant name redacted here per evidence
rules; verbatim on the live triage row for QDOS26007). Verified 2026-07-16: the current
classifier abstains this verbatim email to other/other (0.3) — no mint; 'other' is
retro-trigger eligible LOCATE-ONLY (TKT-219).

## Instruction

Pin the verbatim QDOS26007 email as a classifier eval fixture (synthetic PII per evidence
rules) expecting the abstain (and any future positive query labeling), per the eval corpus
conventions (scripts/evaluation/email/).

## Siblings

The three structural guards this pin backstops: TKT-234 (own-report recognition), TKT-235
(no-instruction hold), TKT-236 (pre-mint archive probe).
