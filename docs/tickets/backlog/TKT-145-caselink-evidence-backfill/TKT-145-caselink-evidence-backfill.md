---
id: TKT-145
title: Accepted case_link on a previously-uncased email must backfill its evidence to the case
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-102, TKT-093]
research-link: docs/tickets/backlog/TKT-145-caselink-evidence-backfill/evidence/operator-note.md
plan: PLAN-003
---

# TKT-145 — Accepted case_link on a previously-uncased email must backfill its evidence to the case

## Problem

When an email was processed while uncased (evidence extracted but unattached) and a case_link suggestion is later accepted, the attach happens but the email's evidence rows are not retroactively attached to the case — photos delivered via the Tractable lane (and similar) never reach the case evidence.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — final-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): on case_link accept (both the manual accept and auto-attach seams), re-point/copy the inbound email's orphan evidence rows to the target case (audited), and trigger a status recompute.

## Acceptance

- Accepting a case_link on an email with orphan evidence attaches that evidence to the case (regression test + live proof).
- Status recompute runs after the backfill.

## Research

Filed 2026-07-09 from the final-wave D2 report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence/)
