# Verification — TKT-101: QDOS two refs wrongly linked as one case

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
- The two QDOS refs (46671/1, 46533/1) resolve to two separate cases.
- Regression coverage for the linking key; affected live cases un-merged with an audit trail.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. The two refs render as two separate cases live (QDOS26056 holds only the 46533/1 Pavlou material; the rebuilt retro case 6cd60114 holds only the two McCarthy 46671/1 emails — no cross-contamination); the detach + rebuild are audited on /logs (delta actor 04:26 + retro rows 04:36); link-guards 6/6 + dedup 22/22 with the exact live shape pinned; the guard is wired at the linkReply seam and present in the deployed bundle (api 89). Remainders (not failures): the rebuilt case is Held pending staff PO confirmation; 46670/1 + 46640/1 are backlog-drain candidates (TKT-140).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
