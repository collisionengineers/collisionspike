# Verification — TKT-085: Registration on A.PCH26003 logged as OCTOBER (VRM false positive)

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance and Verification-requirements sections of the ticket .md.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE — root-cause path proven on the deployed stack: POST /api/parse with the ACTUAL A.PCH26003 source document (AJB14044.AudatexMS.pdf) returns the REAL plate BE57JDS (not OCTOBER); classify probes reject month/day words; guards + fixtures present in BOTH engines; A.PCH26003 cleared (junk removed, plate deliberately not guessed back — staff confirm from documents); post-check 0 month/day VRMs. Adjacent finding already ticketed: the RIGERANT case_ref -> TKT-136.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
