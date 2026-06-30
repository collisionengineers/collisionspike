# Verification — TKT-040: Informal roadworthy work-request misrouted to 'Other'
## Verdict
NOT YET IMPLEMENTED
## Evidence
Repro email in evidence/ (`(EREF5) RTA on 27_06_2026  Mr Mohammed Osman Ahmed (Our Ref HMA_46428_1, Vehicle
WN14XPZ).eml`, plus 4 damage photos: 2_CLVDamage4-V1.jpg, 3_CLVDamage3-V1.jpg, 4_CLVDamage2-V1.jpg,
CLVDamage5-V1.jpg). No build yet.
## Pending / gaps
Classifier rule needed: treat damage-photo attachments plus vehicle/case identifiers (reg, Our Ref, RTA date)
as a work-request signal even without a formal instructions document, rather than routing to 'Other'.
## How to re-verify (once built)
Re-intake the sample .eml; confirm it routes to work-request / new-case handling, not 'Other'.
