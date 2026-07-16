# Verification — TKT-014: Remove the acme.co.uk placeholder from provider fields

## Verdict
TESTED (offline)

## Evidence
Source sweep: zero `acme` occurrences in the SPA source. The provider field now carries a neutral aria-label instead of the fake-domain placeholder.

## Pending / gaps
Source-level confirmation; not re-screenshotted on the live SPA. Live SPA: ../../operations/live-environment.md.

## How to re-verify
- `grep -ri acme apps/web/src` → expect no matches.
- Open a provider field on the deployed SPA and confirm no `acme.co.uk` placeholder.
