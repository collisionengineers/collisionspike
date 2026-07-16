# Verification — TKT-070: Inbox email previews are one unreadable line — keep line breaks, cut noise

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements**: domain vitest fixtures on real
`tests/fixtures/manifests/evidence.json#` samples (newlines, blank-line collapse, URL shortening, quote-chain cuts,
signature drop); verify-all + orch deploy recorded; live probe capturing a post-deploy
`body_preview` row + Inbox-panel screenshot; VRM-sniff regression guard.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. A post-deploy live intake (AX inspections, 09/07 ~05:00) stores an 11-newline cleaned preview — paragraphs preserved, zero bracket/tel/mailto garbage, bare hosts only — which the old flattening path mathematically cannot produce; the panel renders pre-wrap 12 lines; the sniff provably still reads the raw body (code + live body_vrm); the pure util is 28/28 green incl. the verbatim QDOS pin; the backfill deferral is deliberate (pre-deploy rows unchanged — expected). Quality note (not a failure): unmarked corporate-footer furniture (address-pipe/trading-as lines) survives — add a marker if the operator re-reports.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
