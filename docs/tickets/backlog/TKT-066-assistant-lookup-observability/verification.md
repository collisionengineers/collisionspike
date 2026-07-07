# Verification — TKT-066: Assistant can't find a case by spaced registration + tool failures are invisible

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements** (all four classes required):
1. Offline: api unit tests — spaced/compact/lower-case VRM + Case/PO normalize to the same match
   set; `runChat` retry-once + `toolErrors` counting under injected tool mocks.
2. Gate: `node verify-all.mjs` green; deploy recorded in changes.md.
3. Live behaviour probe: deployed `POST /api/assistant/chat` with a spaced VRM (e.g. `YT13 UTV`)
   returns the correct case; capture the raw reply here.
4. Live telemetry probe: App Insights KQL showing the `[assistant] tool … failed` warn trace and
   an audit-lite event with `toolErrors ≥ 1`; paste the query + result rows here.
