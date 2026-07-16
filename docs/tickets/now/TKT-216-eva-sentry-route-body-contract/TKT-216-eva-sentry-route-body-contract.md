---
id: TKT-216
title: Repair the EVA Sentry route and body contract
status: now
priority: P1
area: integration
tickets-it-relates-to: [TKT-094, TKT-126, TKT-130, TKT-159, TKT-178, TKT-211, TKT-215]
research-link: docs/tickets/now/TKT-216-eva-sentry-route-body-contract/evidence/operator-note.md
plan: PLAN-004
---

# Repair the EVA Sentry route and body contract

## Problem
The current caller and retained EVA Sentry service disagree at their route/body seam. A repository cleanup could accidentally hide the defect by removing the service as apparently unused. This is a production-readiness integration defect: preserve the service, establish the exact contract and fix the seam under PLAN-004.

## Evidence
- The operator explicitly separated this mismatch from PLAN-006 and required the EVA Sentry service to remain.
- Current source indicates different caller and service expectations; deployed behavior and the precise mismatch still require read-only confirmation before implementation.

## Proposed change
Record the caller's method, route, request body, authentication and response handling beside the service's accepted contract; choose one supported seam; update only the mismatched integration boundary; and add contract tests plus authorized deployed proof. Do not replace or remove the service as a cleanup shortcut.

## Acceptance
- **A1.** A read-only evidence artifact records the current caller method, route, headers, request body, response handling and retry behavior, the service's accepted contract, and the deployed function/telemetry evidence that identifies the exact mismatch.
- **A2.** One canonical, versioned contract defines the supported method, route, body, success response and error response; caller and service tests consume the same fixture or schema.
- **A3.** The implementation changes only the integration seam required to make caller and service agree. It preserves the EVA Sentry service, its authentication boundary, business validation and audit behavior.
- **A4.** Contract tests prove a valid request reaches the intended handler once, malformed or incomplete input fails clearly, retries do not duplicate work, and response/error handling is deterministic.
- **A5.** Existing case readiness, export, completion, authorization and numeric-domain behavior remains unchanged outside this seam.
- **A6.** An authorized deployment and read-only telemetry review prove the fixed route is invoked successfully. Any real external submission remains behind its existing approval gate; no fabricated production case or unapproved write is used for proof.
- **A7.** TKT-211 and PLAN-006 preserve this service and identify TKT-216 as the separate owner of the mismatch.

## Validation
- Run caller, service and shared-contract tests offline.
- Confirm route registration and configuration read-only in the deployed environment before and after a separately authorized deployment.
- Attach one trace or equivalent telemetry artifact showing the intended handler and response without exposing credentials or client data.

## Research
Distilled from the operator's 2026-07-15 repository-reset decision. This ticket is deliberately outside PLAN-006.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
