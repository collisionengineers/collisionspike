# Verification — TKT-121: The "E-mail Type" dropdown fills the whole page — cap its height with a scrollbar

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Deployed-SPA DOM measurement (1920x959): listbox clientHeight 320px = exactly 10 x 32px option rows, computed max-height 320px + overflow-y auto, demonstrably overriding Fluent's 723px inline autoSize; scrollHeight 922 > 320 (internal scrollbar); wheel-scroll reached the last option "All other"; keyboard ArrowDown x17 walked first->last with auto-scroll-into-view and ArrowUp returned. All 18 grouped options reachable.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
