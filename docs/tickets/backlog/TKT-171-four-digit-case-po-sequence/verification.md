# Verification — TKT-171: Keep Case/PO numbering working after 999

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — three-digit default and four-digit overflow | Shared formatter/parser plus isolated production-shaped tests prove 001–999 and 1000–9999 exactly, including no truncation, wrap or premature fourth digit. | Read-only signed-in proof confirms existing real three-digit values; 999/1000 live proof waits for a naturally occurring operator-designated boundary. | PENDING |
| A2 — atomic 999→1000 allocation | Isolated transaction and concurrency tests race requests at the boundary and assert distinct Case/POs, operation ids and folder intents. | Live database/audit proof is captured only if a real scope naturally crosses the boundary; no disposable scope is created. | PENDING |
| A3 — one contract across every consumer | Contract tests enumerate principal lengths, marker forms, API/schema/import/manual/retro validators and fail on a fixed-three-digit remainder. | Deployed contract/version inspection plus any naturally available four-digit real case shows no validation disagreement; no case is edited for proof. | PENDING |
| A4 — truthful preview and EVA entry | SPA and isolated deployed tests prove a four-digit value renders, submits unchanged and no visible copy says “3 digits”. | Signed-in browser proof waits for a naturally occurring four-digit case and remains PENDING until then. | PENDING |
| A5 — search and correlation identity | Domain/API and isolated deployed fixtures resolve the same four-digit Case/PO through exact search, email matching, retro lookup and Archive-name parsing, with false-prefix negatives. | Signed-in search/correlation proof uses a naturally existing four-digit case only; otherwise it remains PENDING. | PENDING |
| A6 — numeric ordering | Unit/integration and isolated deployed tests prove parsed ordering 998, 999, 1000, 1001 and correct latest-sequence selection inside one scope. | Live list/database ordering is recorded only after real 1000 exists; no live boundary is manufactured. | PENDING |
| A7 — scope and legacy stability | Regression fixtures prove existing three-digit strings are unchanged and marker/principal/year sequences remain independent. | Read-only live comparison of representative existing Case/POs and sequence counters shows no cross-scope movement. | PENDING |
| A8 — full-value persistence and safe upper bound | Schema, serialization, audit, filename/export and Archive-name tests in an isolated production-shaped deployment preserve four digits; 10000 is refused without reuse or truncation. | Live persistence/export/archive proof waits for a naturally occurring four-digit case; no production item is created or renamed for proof. | PENDING |
| A9 — complete regression and approved deployed proof | All named domain, allocator, API, orchestration, SPA and isolated deployment suites pass with the boundary matrix. | Signed-in proof records deployed legacy stability now and the real boundary later; evidence confirms no provider was advanced solely for testing. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the offline and isolated non-live boundary suites, gather read-only signed-in legacy proof, and retain the boundary-dependent live rows as PENDING until real work naturally reaches 1000.
