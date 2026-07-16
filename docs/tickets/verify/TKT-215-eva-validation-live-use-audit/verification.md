# Verification — TKT-215: Audit live use and disposition of the EVA validation service

## Verdict
TESTED (offline)

## Evidence
- [Read-only live-use audit](./evidence/live-use-audit-2026-07-15.md).
- Repository runtime callers: zero; canonical readiness remains in the domain package and Data API.
- Expected caller settings: Data API zero; orchestration has only the separate submission-service URL.
- Deployed resource: enabled and Running, one registered validation route, no caller configuration.
- Shared Application Insights, prior 90 days: zero matching requests and zero matching traces.
- The repository service path is absent from the target function layout and current inventory.
- Shared domain and Data API suites passed 554 and 772 tests respectively after removal.
- Current inventory and strict/broad/binary/image gates pass without the retired repository source.

## Pending / gaps
- Root is completing the final clean install/build/bundle smoke; remote CI and independent verification
  remain pending.
- Live resource retirement is not authorized by PLAN-006 and remains separate production work.
- An unrecorded future external caller is technically possible; keeping the live resource unchanged is
  the rollback guard until a separately approved retirement.

## How to re-verify
Repeat the repository caller/config search and the 90-day requests/traces queries in the attached audit.
Run the shared domain and Data API status tests after source removal, then confirm the final inventory has
no repository service path. Any future live retirement needs its own approval and pre-delete traffic check.
