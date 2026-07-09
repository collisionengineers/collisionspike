# Verification — TKT-100: QDOS false VRM "AND2"

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
- Parsing the four QDOS samples yields no "AND2" VRM.
- Eval/regression pin covers the QDOS false-positive.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Live probe: a QDOS shape carrying the Higsons "Offices 1 and 2" footer verbatim + a vehicle mention returns body_vrm empty (never AND2); function-word denylists in both engines with tests; eval pin tkt100-qdos-lead green in the 58-item corpus; QDOS26056 + 4 inbound rows cleared with audit + backup, post-check 0. The linking lane itself stays with TKT-101.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
