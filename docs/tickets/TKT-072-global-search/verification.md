# Verification — TKT-072: The search box doesn't search — global search across cases, emails, providers

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements**: api unit tests (matching, space-insensitive VRM,
caps, short-query guard, auth) + SPA build; verify-all + deploys recorded; live click-through
(same-VRM results + grouping header screenshots, case/email row navigation); live endpoint
probes (JSON with token, 401 without); Postgres cross-check of the same-VRM count.
