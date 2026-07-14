# Verification — TKT-175: Investigate resilience to direct Archive changes

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline/controlled evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — current cross-system lifecycle baseline | Source/schema trace plus controlled fixture inventory maps every listed identity, job and audit relationship. | Authenticated read-only configuration/database/provider evidence confirms which mapped paths are actually deployed. | PENDING |
| A2 — complete operation matrix | Controlled provider experiments cover every named file/folder delete, rename, move and restore/recreate row. | Read-only live configuration proves the matrix uses the same watched-root/event semantics as production. | PENDING |
| A3 — effects recorded per matrix row | Before/after snapshots and event replays populate every required result column with artifacts. | Read-only production logs/UI samples corroborate applicable observed states without inducing them. | PENDING |
| A4 — strict test boundary and zero production mutation | Fixture setup records the approved test folder and rejects any target outside it. | Signed-in before/after production inventories and audit logs prove no production file, folder, case or evidence write. | PENDING |
| A5 — cascade-loss determination | Fault tests and database diffs prove or disprove each listed deletion/detachment path; any failure names a follow-up. | Read-only live query checks for evidence of the same path and records findings without repair. | PENDING |
| A6 — detection/race gaps enumerated honestly | Event simulations cover duplicate, missing, delayed, out-of-order, permission and concurrent-job cases. | Deployed subscription/webhook/retry/dead-letter health is inspected read-only and unsupported conclusions remain marked unknown. | PENDING |
| A7 — safe reconciliation options compared | Threat-model review scores each option against preservation, identity, readiness and confirmation requirements. | A signed-in read-only walkthrough demonstrates how current discrepancies surface and where the proposed safe state would be visible. | PENDING |
| A8 — atomic follow-up tickets, no implementation | Review confirms every recommended change has its own priority/scope/acceptance and the investigation diff contains no production implementation. | Deployed version/configuration comparison confirms no watcher, cascade or repair behavior was shipped by this ticket. | PENDING |
| A9 — reproducible, fully accounted report | Report lint/replay confirms every matrix row has sanitized evidence, reproduction steps and a terminal classification. | Authenticated readers can resolve the retained non-secret live evidence references and provider-limit sources. | PENDING |
| A10 — independent repeatability and no-mutation proof | Independent reviewer repeats a representative controlled subset and matches classifications. | Independent signed-in reviewer checks production read-only artifacts and zero-mutation audit evidence. | PENDING |

## Pending / gaps
The investigation, controlled experiments, production read-only check and independent review have not started.

## How to re-verify
Complete the matrix without production mutation, attach one concrete artifact for each offline and signed-in/live cell, and keep the verdict `PENDING` until an independent reviewer confirms all ten acceptance lines.
