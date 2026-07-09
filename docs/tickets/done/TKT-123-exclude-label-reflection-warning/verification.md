# Verification — TKT-123: Rename "exclude (person reflection)" to "Exclude" + dismissible vision reflection warning on images

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Label reads exactly "Exclude" on live photo cards (old wording nowhere); the dismiss E2E is proven by three independent artifacts (pre-dismiss screenshot, the live patchEvidence audit row "Reflection warning dismissed on …img_2.jpeg" 00:35, and a fresh post-dismiss reload showing no warning — server-side persistence); DDL delta + patchEvidence route deployed (az list); the orch classifier stamps person_reflection on both branches with exclusion policy unchanged. Expected absence: no live UNdismissed flag exists yet (stamps from new intakes; ~8.2k historical rows await the TKT-131 backfill).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
