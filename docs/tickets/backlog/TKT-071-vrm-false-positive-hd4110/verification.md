# Verification — TKT-071: Job references like HD4110 wrongly captured as a vehicle registration

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements**: dual-language fixture suites (TS vitest + the
sibling's Python tests) green; verify-all + deploys (incl. sibling re-vendor) recorded; live
HD4110-style intake replay proving no junk VRM in Postgres; before/after data-fix counts + audit
rows; one genuine-VRM recall probe post-deploy.
