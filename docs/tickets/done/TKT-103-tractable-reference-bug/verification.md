# Verification — TKT-103: Tractable "768.00" wrongly captured as reference

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
- Parsing the Tractable samples yields the correct reference (or none), never `768.00`.
- Regression/eval pin covers the Tractable reference field.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. All THREE Tractable samples POSTed live: body_jobref empty on every one (768.00 / 168.12 / 487.32 present in the bodies, never captured); the money guard verified in the deployed vendored engine (byte-identical to the sibling); unit pins pass (money rejection + dotted-sequence refs still extract past a money value); label-honest eval item green; --check clean. The /parse-path residual is TKT-136 (confirmed filed).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
