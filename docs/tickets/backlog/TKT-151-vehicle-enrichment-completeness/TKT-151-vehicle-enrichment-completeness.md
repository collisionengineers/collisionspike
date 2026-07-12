---
id: TKT-151
title: Complete vehicle enrichment and warn when a registration cannot be resolved
status: backlog
priority: P1
area: enrichment
tickets-it-relates-to: [TKT-044, TKT-102, TKT-147, TKT-150]
research-link: docs/tickets/backlog/TKT-151-vehicle-enrichment-completeness/evidence/operator-note.md
plan: PLAN-004
---

# Complete vehicle enrichment and warn when a registration cannot be resolved

## Problem
Cases can remain without mileage, make, or model even when a valid registration is present and the live DVLA/DVSA enrichment path should supply those details. When the registration is not found or a lookup fails, the case does not give staff a durable, understandable warning.

## Evidence
- [Operator note](./evidence/operator-note.md) — missing mileage/make/model and warning requirement.
- TKT-044 — arithmetic verification only; it does not cover field completeness or failure visibility.
- TKT-147 — a Tractable-specific make/VIN extraction path, not general enrichment.

## Proposed change
PROPOSED (not built): census the live gaps, make the canonical enrichment outcome explicit, repair persistence and precedence, surface plain-language warnings, and backfill eligible cases safely.

## Acceptance
- A live census identifies every active case with a registration but missing make, model, or mileage, grouped by provider, intake path, lookup outcome, and last enrichment attempt.
- For a canonical valid registration, one enrichment request returns a typed outcome for vehicle identity/details and MOT-based mileage: found, not found, insufficient MOT evidence, invalid registration, temporarily unavailable, or configuration/auth failure.
- One authenticated Data API route owns this request and is wired to orchestration, Manual Intake and an explicit case retry; the UI never falls back to the current `not_connected` placeholder transport.
- Document-extracted values remain authoritative when valid; enrichment fills only absent/invalid fields and never silently replaces a staff-confirmed value.
- A successful lookup persists make and model consistently across initial intake, manual image-only creation followed by instructions, merge/adoption, and explicit retry.
- Automatic enrichment or the working retry covers every case with a valid registration and unresolved model/mileage; no provider path is skipped on the assumption that a nonexistent staff trigger will run later.
- Mileage uses the canonical estimator in TKT-152 and stores enough source/method metadata to distinguish an observed reading from an estimate.
- `not found`, `invalid registration`, `insufficient evidence`, and transient/service failure remain distinct. Staff see a durable plain-language case warning with a retry path where retry is meaningful.
- Required vehicle fields that remain unresolved keep the case Not Ready. A transient warning is not silently cleared until a later successful result is persisted.
- Retry and orchestration logic is idempotent and bounded; it does not create duplicate audits or overwrite later human edits.
- A backup-first remediation retries all eligible missing-field cases and produces a before/after/residual ledger without touching cases that lack a defensible registration.
- Tests cover GB/NI registration normalisation, lookup success, not-found, insufficient MOT history, timeouts/retries, document precedence, staff precedence, merge, and repeated delivery.
- Live proof includes successful enrichment, a genuine/controlled not-found result with visible warning, and a final census that accounts for every remaining gap.

## Research
Distilled 2026-07-12 from the operator report; raw wording is in [evidence/](./evidence/).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
