# Verification — TKT-119: Retro case-locate failed on ref PHA5007 — acks must never mint, add an "Unable to Locate" outcome, explore Graph deleted-items

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. (a) PHA5007 root cause documented + the drain FIELD-PROVEN: retroCreate outcome=created traced 04:36:35Z; case 87e79f62 renders live with BOTH recovered PHA 5007 emails, the Retro (reconstructed) chip, and the full retro audit trail. (b) Dual-seam ack-mint guard 14/14 + 55/55 with symbols in both deployed bundles. (c) Unable-to-locate path deployed end-to-end (delta + api route + SPA chip/banner strings in the live bundle, 10/10 tests) — no live firing yet because both drains SUCCEEDED (expected tail). (d) The feasibility memo + raw probe JSON with measured numbers incl. the tokenization caveat (-> TKT-139).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
