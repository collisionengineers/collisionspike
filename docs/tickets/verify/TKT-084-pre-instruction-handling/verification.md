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

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING — everything buildable is live and proven: sign-off recorded; the sample classifies pre_instruction/pre_instruction_directions live (taxonomy 3, eval pin 1/1, gate-off demotion 11/11); TRIAGE_PRE_INSTRUCTION_ENABLED=true read back; correlatePreInstruction + internalTriageHeldPreInstruction deployed (counts match registry); the SPA renders the handler-plain Pre-instruction group. Remaining tails (natural-arrival class, stays verify): a real pre-instruction email held in the lane (Postgres row, no case minted) and the later matching instruction raising the case_link suggestion; a targeted unit test of the held-rows FIND matching would strengthen the second. No failures found.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING.**

1. **Operator sign-off recorded — PASS** (`evidence/operator-signoff-2026-07-09.md`).
2. **Sample classifies `pre_instruction`, no case minted — PASS at classifier + guard layers;
   row-level Postgres proof QUEUED.** Live deployed-parser probe this pass with the REAL sample's
   fields → 200 `{"category":"pre_instruction","subtype":"pre_instruction_directions",
   "confidence":0.8,"taxonomy_version":3}` (Rule 0e signals). Fresh eval pin 1/1. No-mint live at
   volume (banked TKT-082 census: 620 non-work → 0 mints, itemised `pre_instruction 1` — the lane
   fired on a natural arrival exactly once, non-minting). `internal-guards.test.ts:52` blocks
   pre_instruction at unit level.
3. **Correlation layer — DEPLOYED + PARTIALLY TESTED, e2e NOT yet proven.** `correlatePreInstruction`
   (orch) + `internalTriageHeldPreInstruction` (api) live; call-site in the shipped bundle;
   `TRIAGE_PRE_INSTRUCTION_ENABLED=true` read back; classifyInbound tests 11/11 fresh. Gap
   (unchanged from 07-09): no unit test exercises the held-rows FIND matching
   (`internal.ts:2204-2219`) or the suggestion-raising loop; no natural held-row→later-instruction
   pair has occurred live.
4. **Full prior eval corpus green — PASS** (58 loaded, 87.9%, "No regression" vs baseline-v2 as
   regenerated at 53748c6; the 7 mismatches are the documented known-miss set).

Queued SQL (next data pass): Q1 the live pre_instruction arrival(s) — held state, directions
retained, PII reported as presence/lengths only; Q1b fallback for a gate-off-window demotion
(`signals LIKE '%pre_instruction%'` stored other/other); Q2 zero mints from pre_instruction (linkage
split + mint-anchor check); Q3 correlation suggestions raised by the lane. The single live arrival's
stored category (pre_instruction vs demoted other) is unconfirmed until Q1/Q1b run — the gate flipped
the same day the engine deployed, so a same-day demotion is possible.

Real gap (weakness, not a failure): acceptance line 3 says "test at the correlation layer" and only
the rationale + gate-demotion halves are tested — a small vitest against the mocked-db harness (the
`internal-guards.test.ts` pattern) would close it without waiting for a natural arrival.

Verified by: ticket-verifier dispatch, 2026-07-10.

### W6 data-pass results (orchestrator-run, 2026-07-10 — the queued SQL)
- **Q1: the row-level proof LANDED** — exactly 1 live pre_instruction arrival
  (`f0027ecd…`, engineers@, 2026-07-09 13:46:59Z), stored category **pre_instruction /
  pre_instruction_directions** (NOT demoted — the Q1b concern is settled), `triage_state='new'`,
  `case_id` NULL (held), directions retained (`body_preview` 234 chars), has_vrm=true.
- **Q2: 0 mints from pre_instruction.** Acceptance line 2 is now fully proven at row level.
- **Q3: 0 correlation suggestions** — the held-row→later-instruction pair has not yet occurred.
  Line 3's e2e remains the only open tail (plus the FIND-matching unit-test gap).
