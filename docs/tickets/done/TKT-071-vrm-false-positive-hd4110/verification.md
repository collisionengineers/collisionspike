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

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Live probes on the deployed parser: the HD4110 instruction shape returns body_vrm empty even with anchor words elsewhere; the tight-anchored "registration HD4110 as advised" still extracts (recall guard). vrm-filter vitest 36/36, sibling targeted 26 pass, eval --check no regression (87.9%); engine-v2.10 provenance + deployed bundles carry the guards; the audited 11-row data fix recorded with backup + post-check 0 junk. Expected absences: firewall-gated DB re-read (recorded post-check stands); full e2e intake replay (would create live state).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
