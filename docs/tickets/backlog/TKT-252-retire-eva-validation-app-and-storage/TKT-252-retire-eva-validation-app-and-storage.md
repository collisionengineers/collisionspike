---
id: TKT-252
title: Retire the EVA-validation app and its storage
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-215, TKT-253, TKT-257]
research-link: docs/tickets/backlog/TKT-252-retire-eva-validation-app-and-storage/evidence/distillation-note.md
plan: PLAN-009
---

# Retire the EVA-validation app and its storage

## Problem
The EVA-validation deployable (`cespkeval-fn-6c6fxd`) is still running in the live estate although its source
was removed from the repository after a read-only no-use audit. The live and repository states disagree: the
repo believes the service retired, the estate still runs it.

## Evidence
`LIVE_FACTS.json` records `evaValidation` with `source: null` and
`repositoryState: "removed after a read-only no-use audit"`, and its live-retirement as a separate production
task. A read-only live pass on 2026-07-19 confirmed the full triple is present and the function app is
Running: the app `cespkeval-fn-6c6fxd`, its Flex (FC1) plan `cespkeval-plan-6c6fxd`, and storage
`cespkevalst6c6fxd`. TKT-215's audit is the sole authority for the disposition decision.

## Proposed change
On explicit per-ticket operator authorisation, delete the EVA-validation function app, its Flex plan, and its
storage account — the full triple — consuming TKT-215's verdict without re-auditing. Re-run the read-only
cloud-inventory runbook before and after and bank the evidence.

## Acceptance
- **A1.** TKT-215 is `done` and its verdict is cited as the sole authority; no fresh audit is substituted.
- **A2.** Under explicit per-ticket operator authorisation, the EVA-validation function app, its Flex plan,
  and its storage account are deleted; before/after cloud-inventory runbook runs are banked into `evidence/`
  with timestamps.
- **A3.** Live re-verification confirms the app, plan, and storage are absent, recorded in `verification.md`
  with timestamps.
- **A4.** No other resource is touched; the redaction sweep (`04-redact-sweep.ps1`) exits clean on any banked
  evidence.
- **A5.** The `LIVE_FACTS.json` retirement update is left to TKT-257 (the last, registry-refresh ticket).

## Validation
- Cloud-inventory runbook diff before/after; a live `show` on each of the three resources returns not-found
  post-deletion; timestamps recorded.

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 1; the triple's live presence and the repository
retirement state were re-verified read-only on 2026-07-19 (`PLAN-009.dossier`). Gated on TKT-215 → `done`.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
