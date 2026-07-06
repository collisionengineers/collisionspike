# Verification — TKT-068: Attach files in the assistant and add them to a case (user-confirmed upload)

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements**: offline auth/insert/rejection tests + SPA build;
verify-all + deploys recorded; live E2E (attach → confirm → API response + Postgres
`case_evidence`/audit rows + Evidence-tab render); negative 401 probe without a token; invariant
audit that the deployed assistant `TOOLS` still has no write tool.
