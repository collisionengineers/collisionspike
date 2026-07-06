# Verification — TKT-076: Inspection suggestions ignore the provider and distance — real scoping + nearest-first

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started. Live probes additionally depend on the TKT-080 reseed landing the
`provider_code`/lat-lon data.

## How to re-verify
Per the ticket's **Verification requirements**: offline scoping/fallback/proximity/honest-empty
unit tests; verify-all + api deploy recorded; post-reseed live endpoint probes (one case per
major provider + one providerless case, JSON captured); one hand-derived ordering cross-check.
