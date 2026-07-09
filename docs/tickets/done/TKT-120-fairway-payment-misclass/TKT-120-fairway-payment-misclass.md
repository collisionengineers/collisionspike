---
id: TKT-120
title: FAIRWAY LEGAL payment transfer marked Unidentified — should classify as payments/billing
status: done
priority: P2
area: email
tickets-it-relates-to: [TKT-105]
research-link: docs/tickets/done/TKT-120-fairway-payment-misclass/evidence/operator-note.md
plan: PLAN-003
---
# TKT-120 — FAIRWAY LEGAL payment transfer marked Unidentified — should classify as payments/billing

## Problem

A transfer/remittance email from "FAIRWAY LEGAL" was marked Unidentified even though it is plainly payment-related. The AI email identification rung (gpt-5 via EMAIL_AI_ENABLED) did not pick it up either — a straightforward identification it should not miss. Root-cause why both the rules and the AI assist missed it.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- TKT-105 (remittance advice under payments/billing) is the sibling category ticket.
- Fairway Legal is a seeded provider domain (fairwaylegal.co.uk, seed 916 Section A).

## Proposed change

PROPOSED (not built): reproduce with the operator sample or a faithful synthetic; extend the payments/billing rules to catch transfer/remittance wording from known provider senders; check the AI-assist rung actually ran (telemetry) and why its verdict did not surface; add an eval-corpus pin.

## Acceptance

- The Fairway transfer sample (or faithful replica) classifies to payments/billing via POST /api/classify-email.
- Telemetry evidence showing whether the AI rung ran on the original and what it returned, with the miss explained in changes.md.
- Eval corpus pin added; classifier regression suite green.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
