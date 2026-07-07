# Verification — TKT-084: Pre-instruction directions email unidentified — define a handling lane

## Verdict
BLOCKED (design not yet approved) — awaiting operator sign-off.

## Evidence
No implementation, and none is permitted yet: the ticket's proof standard requires operator sign-off of
the handling-options note **before the build** (Verification requirement 1), and Acceptance item 1 is the
same gate. `evidence/` holds only the operator drop-note + the sample `.eml` — no sign-off file. Confirmed
in code: no `pre_instruction` taxonomy lane exists (`grep pre_instruction|pre-instruction` outside the
tickets tree → no matches).

## Pending / gaps
Operator must review the proposed `pre_instruction` handling (queue placement, hold/correlate on the later
official instruction, retention if none arrives) and record a decision in `evidence/`. Only then can the
lane be designed + built behind a `TRIAGE_*`-style gate.

## How to re-verify (once unblocked + built)
Per the ticket's four proof classes: offline eval pins the sample to the new lane (no case minted); a
subsequent matching instruction surfaces the held directions; `node verify-all.mjs` green; live replay
proves the lane + retained directions in Postgres.
