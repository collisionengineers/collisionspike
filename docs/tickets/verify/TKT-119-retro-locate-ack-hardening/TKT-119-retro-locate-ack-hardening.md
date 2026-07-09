---
id: TKT-119
title: Retro case-locate failed on ref PHA5007 — acks must never mint, add an "Unable to Locate" outcome, explore Graph deleted-items
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-058, TKT-081, TKT-059, TKT-106]
research-link: docs/tickets/verify/TKT-119-retro-locate-ack-hardening/evidence/operator-note.md
plan: PLAN-003
---
# TKT-119 — Retro case-locate failed on ref PHA5007 — acks must never mint, add an "Unable to Locate" outcome, explore Graph deleted-items

## Problem

Retro case-create is not working — example ref "PHA5007". Separately, acknowledgement emails, queries, and similar must be blocked from creating a new case even when retro-locate fails (an acknowledgement minting a case makes no sense). When a case cannot be reconstructed from Outlook history + Box history the UI should say "Unable to Locate". There may also be recoverable history in Outlook Deleted Items (7-9k messages per mailbox per the TKT-059 dry-run vs ~117 live inbox) — previously deferred, but filtered by ref/VRM/claimant it may be able to reconstitute most cases and is worth a read-only feasibility pass.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- TKT-058 (retro reconstruction, verify) is the deployed machinery; RETRO_CASE_ENABLED + RETRO_OUTLOOK_SEARCH_ENABLED are live, the Box rung is dark pending sequence alignment.
- TKT-081 added the categoryMintsCase guard; the operator reports acks can still end in a new case via the retro/unmatched path.
- TKT-059 dry-run evidence: inboxes hold ~117 messages vs 7-9k in Deleted Items — the reason mailbox-sourced rebuild was ruled non-viable.

## Proposed change

PROPOSED (not built): (1) root-cause the PHA5007 retro failure (KQL on the retro orchestrator + rung audits) and fix; (2) harden the mint guard so acknowledgement/query/non-actionable emails can never create a case from ANY path (classifier, retro, manual suggest) — belt-and-braces at the Data API create seam; (3) surface a terminal "Unable to Locate" outcome in the SPA when reconstruction from Outlook + Box fails; (4) read-only Graph feasibility probe over Deleted Items filtered by ref/VRM/claimant, reported as a decision memo (no mailbox mutation — live Outlook must not be mutated).

## Acceptance

- PHA5007 root cause documented in changes.md with the failing rung + fix deployed; a retro locate on a known-good ref succeeds live.
- An acknowledgement/query email can never mint a case from any path — proven by a unit/integration test at the create seam plus the classifier guard.
- A failed reconstruction shows "Unable to Locate" to staff (no silent nothing, no wrong new case).
- A written feasibility memo on Graph Deleted Items reconstruction (read-only evidence; no mailbox mutation performed).

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
