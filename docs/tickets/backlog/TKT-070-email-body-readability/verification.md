# Verification — TKT-070: Inbox email previews are one unreadable line — keep line breaks, cut noise

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements**: domain vitest fixtures on real
`test-cases-and-data/` samples (newlines, blank-line collapse, URL shortening, quote-chain cuts,
signature drop); verify-all + orch deploy recorded; live probe capturing a post-deploy
`body_preview` row + Inbox-panel screenshot; VRM-sniff regression guard.
