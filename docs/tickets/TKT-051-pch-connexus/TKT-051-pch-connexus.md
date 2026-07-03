---
id: TKT-051
title: PCH not identified — doc-content name + @pch-ltd.com senders both missed
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-021, TKT-028]
research-link: docs/tickets/TKT-051-pch-connexus/evidence/operator-note.md
---

# PCH not identified — doc-content name + @pch-ltd.com senders both missed

## Problem (operator drop-note, verbatim in [evidence/operator-note.md](./evidence/operator-note.md))

Intake fails to identify PCH (**Performance Car Hire** — the name is present in the body of the
inspection-request document), and direct mails from `*@pch-ltd.com` senders aren't categorised as
PCH either.

## Wanted

Two fixes working together (ADR-0011): the parser's doc-content provider detection must map to a
real `work_provider_id` at case-resolve (doc content is the *primary* provider signal), and
`@pch-ltd.com` joins the provider's own match domains — while intermediary-routed traffic (Connexus,
TKT-021) resolves through the Image-Source intermediary map.

## Evidence

- `Enclosing Inspection Request to Engineers 2 (Collision Engineers Ltd)  577349.eml`
- `Inspection Request - Audit Report.DOC`
- `_EHR102814_Engineers Repair Images_08076836.pdf`, `_EHR102814_Plus_.pdf`, `_EHR102814_Plus_Report_.pdf`

## Delivery

Phase 3 of the [Rules Engine v2 plan](../../plans/rules_engine_v2_plan_9ba034c4.plan.md)
(identification upgrade).

## Status update — 2026-07-02 (now — code deployed, activation pending D8 seeds)

`3a772d1` (feat(identification): Image-Source intermediary resolution + parser-string →
work_provider_id mapping, ADR-0011) deployed live on `cespk-api-dev`/`cespk-orch-dev`. Verified-first
against this ticket's own evidence: the doc-content provider detector already extracts "PCH" from
`Inspection Request - Audit Report.DOC` at confidence **1.0** — the gap was that the detected string was
never mapped to a real `work_provider_id`; that mapping is now live at `caseResolve` (fill-if-empty +
provenance). The `@pch-ltd.com` domain addition to PCH's `known_email_domains` rides the operator-gated
seed delta [`2026-07-02-rules-engine-v2-identification.sql`](../../../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql)
([docs/gated.md](../../gated.md) §D8), **not yet applied live**. No live re-probe of this exact sample has
been run post-deploy — awaiting the D8 apply to exercise both signals together.
