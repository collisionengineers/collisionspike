# Verification — TKT-092: PCH cases duplicating for no reason

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance and Verification-requirements sections of the ticket .md.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING — everything except the live probe is proven: PCH26009 absorbed all 3 FW-resend emails (163 evidence rows arithmetic closes exactly); PCH26018/20 emptied + retired with merge audits; the QCL pair merged; dedup keying fix (internetMessageId) live in the bundle with the three FW-resend vectors pinned; the deliberately-unmerged pairs recorded with ADR-0010 rationale. The remaining tail is the ticket's own class-5 live probe: the next real PCH re-send must yield exactly one case. REAL RESIDUAL (filed as TKT-141): retired linked_to_instruction duplicates still count in twin badges ("3 open cases share this registration") and attention lists — reads as duplicates-still-there.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
