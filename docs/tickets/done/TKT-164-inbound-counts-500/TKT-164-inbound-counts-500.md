---
id: TKT-164
title: Restore the live inbound dashboard counts
status: done
priority: P1
area: platform
tickets-it-relates-to: [TKT-007, TKT-054, TKT-122, TKT-155]
research-link: docs/tickets/done/TKT-164-inbound-counts-500/evidence/live-observation.md
plan: PLAN-004
---

# Restore the live inbound dashboard counts

## Problem
The deployed SPA's request to `/api/inbound/counts` returns HTTP 500 with `{"error":"internal"}`. The page does not surface the failure, so inbox summary data can be absent or stale while the dashboard otherwise appears healthy.

## Evidence
- [Live observation](./evidence/live-observation.md) — captured through the signed-in deployed SPA on 2026-07-12.
- The CORS preflight returned 204 and the application console was clean, narrowing the fault to the endpoint or its downstream query rather than browser access.

## Proposed change
PROPOSED (not built): diagnose the live query/runtime fault, restore the endpoint contract and make partial dashboard failure visible without taking down healthy dashboard sections.

## Acceptance
- The root cause is proven with App Insights/KQL or equivalent live service evidence and tied to the exact failing code/query/configuration path.
- Authenticated `GET /api/inbound/counts` returns HTTP 200 and the documented count contract for a permitted staff role; unauthorized access retains the existing 401/403 behavior.
- The query handles empty categories and an empty inbox deterministically, and does not depend on a database-owner privilege or bypass RLS.
- Endpoint/unit/integration tests cover populated data, zero counts, query failure, role enforcement and the production schema shape that triggered the incident.
- The dashboard renders returned counts without stale fallback. If only this endpoint fails, the affected panel shows a concise retryable handler-facing error while healthy panels remain usable.
- Telemetry records a correlation identifier and actionable server-side failure detail without exposing technical detail or sensitive data in the rendered UI.
- Chrome verification against the deployed SPA shows no 5xx request for the endpoint, no console error and count values consistent with an independent read of the same live source.
- Registry/runbook documentation records the endpoint's health probe and a focused diagnostic procedure.

## Research
Discovered during the mandatory live Chrome preflight on 2026-07-12.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Live observation](./evidence/live-observation.md)
