# Verification — TKT-116: Paginate the case queues at 15 per page (same as the inbox)

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Exhaustive page-through of all three queues: max 15 rows per page everywhere (Not ready [15x10,5], Review [15x9,1], Held [15,15,15,14]); the pager is the identical control to the inbox (same four aria-labelled buttons, "1-15 of N cases" range text); Next paging proven (16-30 of 155); totals reconstructed from page counts match the dashboard tiles, sidebar badges, and tab labels exactly (155/136/59).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
