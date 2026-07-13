
## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE (classify layer — the scoped acceptance). Real sample "Claim Cancelled - SBL-B0649696" -> 200 cancellation/cancellation_notice, taxonomy_version 2; corpus cancellation recall 12/12, no regression; TRIAGE_CANCELLATION_ENABLED=true read back on cespk-orch-dev; the code path is propose-only (propose_cancellation ai_suggestion; cancellation never mints, never auto-closes). Recorded open item (not a failure): operator decision on a hold category for the 13th sample; no real cancellation email has yet exercised the acting rung live.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Reopened verdict — 2026-07-13

PENDING — the earlier `cancellation` classification remains VERIFIED-LIVE, but it proves only the
superseded propose-only scope. Exact-single auto-attachment, automatic Held transition, explicit ambiguity
reasons, idempotent resolution and server-side EVA blocking require implementation and fresh independent
live evidence before this ticket can return to `done`.

### How to re-verify

Replay the corpus offline, then gather live evidence from genuine operator-designated cancellation work.
For a naturally occurring exact-single cancellation, capture the inbound-email link, case status and hold
reason, audit rows, queue membership, duplicate-retry result and direct submission refusal. Capture a
same-VRM ambiguous counterexample only when it occurs naturally; otherwise retain that live class as
PENDING and rely on isolated proof. Do not create live cases or messages solely for verification.
