---
id: TKT-145
title: Accepted case_link on a previously-uncased email must backfill its evidence to the case
status: verify
priority: P2
area: intake
tickets-it-relates-to: [TKT-102, TKT-093]
research-link: docs/tickets/verify/TKT-145-caselink-evidence-backfill/evidence/operator-note.md
plan: PLAN-003
---

# TKT-145 — Accepted case_link on a previously-uncased email must backfill its evidence to the case

## Problem

When an email was processed while uncased (evidence extracted but unattached) and a case_link suggestion is later accepted, the attach happens but the email's evidence rows are not retroactively attached to the case — photos delivered via the Tractable lane (and similar) never reach the case evidence.

**Widened (PR47–52 review, PR52-F4):** the `imagesReceivedVrmMatch` (Tractable/PDF-VRM) lane is a NON-minting suggest-first path, so for those deliveries the attachments are never even extracted as evidence (the orchestrator returns without `classifyPersist`/`extractImages`); `inbound_email` stores no attachment blob refs, and there is no Data-API → orchestration re-fetch seam. So the full fix is architectural — either persist attachment refs at intake (new column + orchestrator write) and persist-on-accept via the internal evidence endpoint + a classify step, or add a new orchestration re-fetch-and-persist endpoint the Data-API accept path calls.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — final-wave workflow finding, 2026-07-09.

## Interim mitigation — LIVE 2026-07-09 (PR47–52 review pass)

Shipped a NON-silent safety net so the gap never loses photos: on case_link accept, when the linked `inbound_email.has_attachments` is true, `promoteAcceptedSuggestion` (services/data-api/src/features/assistant/register-suggestion-routes.ts) writes a durable, handler-safe case **note** — "The linked email arrived with attachments … Please add them by hand from the email." Staff therefore attach the photos manually instead of the evidence silently vanishing. This is a mitigation, NOT the fix — the acceptance below still stands.

## Proposed change

PROPOSED (not built): on case_link accept (both the manual accept and auto-attach seams), re-point/copy the inbound email's orphan evidence rows to the target case (audited) — and for the non-minting image-delivery lane, recover + process the landed attachments — then trigger a status recompute.

## Acceptance

- Accepting a case_link on an email with orphan evidence attaches that evidence to the case (regression test + live proof).
- Status recompute runs after the backfill.

## Research

Filed 2026-07-09 from the final-wave D2 report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
